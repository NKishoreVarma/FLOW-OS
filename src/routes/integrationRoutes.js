import express from 'express';
import { initiateConnection } from '../controllers/integrationController.js';
import { processIncomingIntel, processStream } from '../services/cognitiveBrainService.js';
import { broadcastToWorkspace } from '../services/socketService.js';
import * as vectorStoreService from '../services/vectorStoreService.js';
import { vaultFallbackScan } from '../services/retrievalService.js';
import { routeQuery }      from '../services/agents/RouterAgent.js';
import { evaluateContext } from '../services/agents/CriticAgent.js';
import { synthesize }      from '../services/agents/ExecutiveSynthesisAgent.js';
import { ingestionQueue } from '../config/queue.js';
import { generateAuthUrl, handleCallback, syncGmailInbox, tokenStore } from '../services/gmailInboundService.js';
import { syncWorkspaceCalendar } from '../services/calendarIntegration.js';

const router = express.Router();

/**
 * @route POST /api/integrations/connect
 * @desc Generate redirect URL to connect user integrations via Composio
 * @access Private (Enforces multi-tenant workspace checks)
 */
router.post('/connect', initiateConnection);

/**
 * @route POST /api/integrations/webhook
 * @desc Receives raw webhook triggers from Composio (Slack/Gmail) and routes them through the cognitive privacy gate
 */
router.post('/webhook', async (req, res) => {
  const workspaceId = req.body?.workspaceId || "";

  // Extract the sender, channel/subject, and the text message payload
  const sender = req.body.sender || req.body.user || req.body.from || 'System';
  const channel = req.body.channel || req.body.subject || req.body.channelName || 'C_ENGINEERING';
  const text = req.body.text || req.body.message || req.body.content || '';

  console.log(`🔌 [Composio Webhook] Incoming message from [${sender}] on channel [${channel}]`);

  // Broadcast ingestion start live frame down the active WebSocket server
  broadcastToWorkspace(String(workspaceId), 'INGESTION_START', {
    workspaceId,
    platform: 'slack',
    channel,
    sender
  });

  try {
    // Stage the intel payload into the BullMQ ingestion queue
    await ingestionQueue.add('new-intel', { workspaceId, sender, channel, text });

    return res.status(200).json({ success: true, message: 'Payload staged in background queue.' });
  } catch (error) {
    console.error('❌ [Composio Webhook] Ingestion error:', error.message);
    return res.status(500).json({ error: 'Composio webhook ingestion failed.', details: error.message });
  }
});

// Quick direct simulation endpoint to force a dashboard print
router.get('/test-trigger', async (req, res) => {
    const workspaceId = req.query.workspaceId || req.headers['workspace-id'];
    if (!workspaceId) return res.status(400).json({ error: 'workspace-id required' });
    try {
        const mockText = "Flow OS engineering architecture utilizes an event-driven control mesh. The backend runs on Node.js port 5001 and handles semantic chunking internally.";
        const source = "slack-test";
        const processingResult = await processStream(workspaceId, mockText, source);
        return res.status(200).json({ status: "forced_success", processingResult });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

/**
 * @route GET /api/integrations/gmail/auth
 * @desc Generate Google OAuth consent URL for Gmail read access
 */
router.get('/gmail/auth', (req, res) => {
  const workspaceId = req.query.workspaceId || '';
  if (!workspaceId) return res.status(400).json({ error: 'Missing workspace-id' });
  const url = generateAuthUrl(workspaceId);
  res.redirect(url);
});

/**
 * @route GET /api/integrations/gmail/callback
 * @desc Google OAuth callback handler to exchange code for tokens
 */
router.get('/gmail/callback', async (req, res) => {
  const code = req.query.code;
  const workspaceId = req.query.state || '';

  if (!code) return res.status(400).send('Missing auth code');
  if (!workspaceId) return res.status(400).send('Missing workspace state parameter');
  
  try {
    await handleCallback(code, workspaceId);
    res.send(`✅ Gmail OAuth successful for workspace: ${workspaceId}. Tokens securely stored in-memory. You can close this tab.`);
  } catch (err) {
    console.error('❌ Gmail OAuth Callback Error:', err);
    res.status(500).send('OAuth exchange failed.');
  }
});

/**
 * @route POST /api/integrations/gmail/sync
 * @desc Manually trigger Gmail background poller for a workspace
 */
router.post('/gmail/sync', async (req, res) => {
  const workspaceId = req.body.workspaceId || '';
  try {
    const result = await syncGmailInbox(workspaceId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route POST /api/integrations/calendar/sync
 * @desc Manually trigger Calendar background poller for a workspace
 */
router.post('/calendar/sync', async (req, res) => {
  const workspaceId = req.body.workspaceId || '';
  try {
    const result = await syncWorkspaceCalendar(workspaceId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * @route  POST /api/integrations/query
 * @desc   Cognitive Synthesis — executes a vector similarity search against the
 *         in-memory knowledge store AND scans the physical vault filesystem,
 *         merges & deduplicates both result sets, then feeds the top-ranked
 *         context chunks into Gemini to synthesize an authoritative answer.
 * @body   { query: string, workspaceId?: string }
 * @access Private (multi-tenant isolated by workspaceId)
 */
router.post('/query', async (req, res) => {
  const { query, workspaceId = '' } = req.body;

  // Guard: query string is mandatory
  if (!query || typeof query !== 'string' || query.trim() === '') {
    return res.status(400).json({
      error: 'Missing required field: `query` must be a non-empty string.'
    });
  }

  const trimmedQuery = query.trim();
  console.log(`🔍 [Cognitive Synthesis] Workspace: ${workspaceId} | Query: "${trimmedQuery.substring(0, 80)}"`);

  try {
    // ── Step 1a: Vector retrieval — cosine-similarity top-K from in-memory store ─
    let vectorChunks = [];
    try {
      vectorChunks = await vectorStoreService.queryKnowledge(workspaceId, trimmedQuery);
      console.log(`📦 [Cognitive Synthesis] Vector store returned ${vectorChunks.length} chunk(s).`);
    } catch (vecErr) {
      console.warn(`⚠️ [Cognitive Synthesis] Vector store query failed: ${vecErr.message}`);
    }

    // ── Step 1b: Vault retrieval — scan physical .md files from FLOW-OS-VAULTS ──
    let vaultChunks = [];
    try {
      vaultChunks = await vaultFallbackScan(workspaceId, trimmedQuery);
      console.log(`📂 [Cognitive Synthesis] Vault filesystem scan returned ${vaultChunks.length} chunk(s).`);
      if (vaultChunks.length > 0) {
        console.log(`📂 [Cognitive Synthesis] Vault chunk keys:`, Object.keys(vaultChunks[0]));
        console.log(`📂 [Cognitive Synthesis] First vault chunk weightedScore:`, vaultChunks[0].weightedScore, '| title:', vaultChunks[0].title);
      }
    } catch (vaultErr) {
      console.warn(`⚠️ [Cognitive Synthesis] Vault scan failed: ${vaultErr.message}`);
    }

    // ── Step 2: Normalise vault results into the same shape as vector chunks ────
    const normalisedVaultChunks = vaultChunks.map(vc => ({
      text:           vc.markdown || vc.content || '',
      source:         vc.platform || 'vault',
      topicId:        vc.channel  || 'vault_file',
      score:          vc.weightedScore || 0.80,
      authorityCoeff: vc.authorityCoeff || 1.5,
      title:          vc.title || 'Vault Intel',
      origin:         'vault_filesystem'
    }));

    // ── Step 3: Normalise vector results to carry authority metadata ─────────
    const normalisedVectorChunks = vectorChunks.map(vc => ({
      text:           vc.text   || '',
      source:         vc.source || 'vector_store',
      topicId:        vc.topicId || 'unclassified',
      score:          vc.score  || 0,
      authorityCoeff: vc.source?.toLowerCase() === 'github' || vc.source?.toLowerCase() === 'vault' ? 1.5 : 0.8,
      title:          `Vector Chunk (${vc.source || 'unknown'})`,
      origin:         'in_memory_vector'
    }));

    console.log(`🔗 [Cognitive Synthesis] Normalised: ${normalisedVaultChunks.length} vault + ${normalisedVectorChunks.length} vector`);

    // ── Step 4: Merge, deduplicate by text content, sort by authority score ──
    const seenTexts = new Set();
    const mergedChunks = [];

    for (const chunk of [...normalisedVaultChunks, ...normalisedVectorChunks]) {
      // Deduplicate: skip if we've already seen identical text content
      const fingerprint = chunk.text.substring(0, 200).trim().toLowerCase();
      if (seenTexts.has(fingerprint)) continue;
      seenTexts.add(fingerprint);
      mergedChunks.push(chunk);
    }

    // Sort by authority-weighted score (authorityCoeff × score) descending
    mergedChunks.sort((a, b) => {
      const weightA = (a.score * a.authorityCoeff);
      const weightB = (b.score * b.authorityCoeff);
      return weightB - weightA;
    });

    console.log(`🔗 [Cognitive Synthesis] Merged ${mergedChunks.length} unique chunk(s) from vector + vault sources.`);
    if (mergedChunks.length > 0) {
      console.log(`🔗 [Cognitive Synthesis] Top merged chunk: score=${mergedChunks[0].score}, authority=${mergedChunks[0].authorityCoeff}, origin=${mergedChunks[0].origin}, title=${mergedChunks[0].title}`);
    }

    // ── Step 5: Apply score threshold ────────────────────────────────────────
    const SCORE_THRESHOLD = 0.1;  // Lower threshold to include vault keyword matches
    const usableChunks = mergedChunks.filter(c => c.score >= SCORE_THRESHOLD);

    if (usableChunks.length === 0) {
      console.log(`⚠️ [Cognitive Synthesis] No usable context found after merge. Returning fallback.`);
      // Broadcast 0-result event to WebSocket live stream
      broadcastToWorkspace(String(workspaceId), 'QUERY_SYNTHESIS_COMPLETE', {
        workspaceId,
        query:       trimmedQuery,
        resultCount: 0,
        chunks:      [],
        answer:      'No cross-channel context found for this query.',
        status:      'NO_CONTEXT'
      });
      return res.status(200).json({
        success:     true,
        workspaceId,
        query:       trimmedQuery,
        resultCount: 0,
        chunks:      [],
        answer:      'No cross-channel context found for this query.'
      });
    }

    // Cap at top 8 chunks for synthesis
    const topChunks = usableChunks.slice(0, 8);

    // ── Step 6: AGENT — RouterAgent: classify query intent + domain weights ──
    broadcastToWorkspace(String(workspaceId), 'AGENT_ROUTING_STARTED', {
      workspaceId,
      query:    trimmedQuery,
      nodeCount: topChunks.length,
      status:   'ROUTING'
    });
    console.log(`🗺️  [Pipeline] RouterAgent starting…`);
    const routerResult = routeQuery(trimmedQuery);
    console.log(`🗺️  [Pipeline] RouterAgent complete: domain=${routerResult.primaryDomain}, score=${routerResult.routingScore}`);

    // ── Step 7: AGENT — CriticAgent: validate nodes, flag contradictions ─────
    let criticResult;
    try {
      criticResult = evaluateContext(topChunks, trimmedQuery);
      console.log(`🔬 [Pipeline] CriticAgent complete: ${criticResult.validatedChunks.filter(c => !c.deprecated).length} valid / ${criticResult.contradictions.length} contradiction(s).`);

      if (criticResult.contradictions.length > 0) {
        broadcastToWorkspace(String(workspaceId), 'CRITIC_EVALUATION_FAILED', {
          workspaceId,
          contradictionsFound: criticResult.contradictions.length,
          deprecatedNodes:     criticResult.validatedChunks.filter(c => c.deprecated).length,
          details: criticResult.contradictions.map(c => ({
            topic:      c.topic,
            challenger: (c.challenger?.title || c.challenger?.source || '?').substring(0, 60),
            incumbent:  (c.incumbent?.title  || c.incumbent?.source  || '?').substring(0, 60),
            reason:     c.reason
          }))
        });
      }
    } catch (criticErr) {
      console.warn(`⚠️ [Pipeline] CriticAgent threw: ${criticErr.message} — continuing with unvalidated chunks.`);
      broadcastToWorkspace(String(workspaceId), 'CRITIC_EVALUATION_FAILED', {
        workspaceId,
        error: criticErr.message,
        contradictionsFound: 0
      });
      criticResult = {
        validatedChunks: topChunks.map(c => ({ ...c, deprecated: false })),
        contradictions:  [],
        criticSummary:   'CriticAgent failed — nodes passed through unvalidated.'
      };
    }

    // ── Step 8: AGENT — ExecutiveSynthesisAgent: produce polished Markdown brief
    console.log(`📋 [Pipeline] ExecutiveSynthesisAgent starting…`);
    const synthesisResult = await synthesize(
      trimmedQuery,
      criticResult.validatedChunks,
      routerResult,
      criticResult.criticSummary
    );
    const answer = synthesisResult.answer;
    console.log(`✅ [Pipeline] ExecutiveSynthesisAgent complete — model: ${synthesisResult.modelUsed}, ${answer.length} chars.`);

    broadcastToWorkspace(String(workspaceId), 'EXECUTIVE_SYNTHESIS_READY', {
      workspaceId,
      query:          trimmedQuery,
      primaryDomain:  routerResult.primaryDomain,
      routingScore:   routerResult.routingScore,
      intentFlags:    routerResult.intentFlags,
      validNodeCount: criticResult.validatedChunks.filter(c => !c.deprecated).length,
      deprecatedCount:criticResult.validatedChunks.filter(c => c.deprecated).length,
      contradictions: criticResult.contradictions.length,
      modelUsed:      synthesisResult.modelUsed,
      synthesisNotes: synthesisResult.synthesisNotes,
      answerPreview:  answer.substring(0, 300) + (answer.length > 300 ? '…' : '')
    });
    console.log(`📡 [Pipeline] Broadcast EXECUTIVE_SYNTHESIS_READY → Workspace ${workspaceId}.`);

    // ── Step 9: Broadcast QUERY_SYNTHESIS_COMPLETE with agent-enriched metadata
    broadcastToWorkspace(String(workspaceId), 'QUERY_SYNTHESIS_COMPLETE', {
      workspaceId,
      query:          trimmedQuery,
      resultCount:    criticResult.validatedChunks.filter(c => !c.deprecated).length,
      status:         'SUCCESS',
      primaryDomain:  routerResult.primaryDomain,
      modelUsed:      synthesisResult.modelUsed,
      answer:         answer.substring(0, 300) + (answer.length > 300 ? '…' : ''),
      nodes: criticResult.validatedChunks.map((c, i) => ({
        rank:              i + 1,
        source:            c.source,
        origin:            c.origin,
        score:             c.score,
        authorityCoeff:    c.authorityCoeff,
        title:             c.title || `Node ${i + 1}`,
        deprecated:        c.deprecated || false,
        deprecationReason: c.deprecationReason || null,
        preview:           (c.text || '').substring(0, 200)
      }))
    });
    console.log(`📡 [Pipeline] Broadcast QUERY_SYNTHESIS_COMPLETE → Workspace ${workspaceId} (${topChunks.length} nodes, domain: ${routerResult.primaryDomain}).`);

    // ── Step 10: Return unified telemetry + answer payload via HTTP ──────────
    return res.status(200).json({
      success:        true,
      workspaceId,
      query:          trimmedQuery,
      resultCount:    criticResult.validatedChunks.filter(c => !c.deprecated).length,
      chunks:         criticResult.validatedChunks,
      answer,
      agentPipeline: {
        router:   { primaryDomain: routerResult.primaryDomain, routingScore: routerResult.routingScore, intentFlags: routerResult.intentFlags },
        critic:   { contradictions: criticResult.contradictions.length, deprecated: criticResult.validatedChunks.filter(c => c.deprecated).length },
        synthesis:{ modelUsed: synthesisResult.modelUsed, synthesisNotes: synthesisResult.synthesisNotes }
      }
    });

  } catch (error) {
    console.error('❌ [Cognitive Synthesis] Pipeline failed:', error.message);
    return res.status(500).json({
      error:   'Cognitive Synthesis pipeline failed.',
      details: error.message
    });
  }
});

export default router;
