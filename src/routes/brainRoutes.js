import express from 'express';
import { runReasoning }     from '../ai/reasoning/OperationalBrain.js';
import { followUpsForCapability } from '../ai/reasoning/IntentClassifier.js';
import { explain }          from '../explainability/index.js';
import { generateBriefing } from '../services/briefingEngine.js';
import { answerCopilotQuery } from '../services/copilotService.js';
import { queryAllMemory, getMemoryStats } from '../services/orgMemoryService.js';
import { getGraphStats, getNeighbors } from '../services/operationalGraphService.js';
import { ValidationError, NotFoundError, AuthorizationError } from '../core/errors/index.js';
import {
  createDecision, listDecisions, updateDecision, fromRecommendation
} from '../services/decisionEngine.js';
import {
  createRule, listRules, listRuns, toggleRule, deleteRule
} from '../services/automationEngine.js';
import {
  createGoal, listGoals, getGoal, updateGoal, addMilestone, completeMilestone, deleteGoal, evaluateGoal
} from '../services/goalTrackingService.js';
import { getProactiveRecommendations, recordRecommendationFeedback } from '../services/operationalIntelligenceService.js';
import { getOperationalTimeline, getEntityContext } from '../services/brainTimelineService.js';
import { getGreeting }    from '../services/conversation/GreetingEngine.js';
import { getJoke }        from '../services/conversation/JokeService.js';
import { getLastContext }  from '../services/conversation/ConversationMemory.js';
import { isGreeting, composeProactiveGreeting, isVague, vagueClarification, isConfirmation } from '../services/conversation/WorkspacePulse.js';
import { isEmailCompose, looksLikeCompose, composeEmailDraft } from '../services/conversation/emailComposer.js';
import { isIssueCompose, composeIssueDraft, isMeetingCompose, composeMeetingDraft, isSlackCompose, composeSlackDraft, isJiraAction, composeJiraDraft } from '../services/conversation/actionComposer.js';

// Shared: build a reviewable draft for any actionable intent (email/issue/meeting),
// or null if the message isn't an action. Each draft carries a governed
// `recommendation` the client executes via /api/execution/execute.
// Resolve a NAMED recipient ("the TechCorp VP", "Dana") to a real address by looking
// through the workspace's recent inbox — the cross-tool intelligence that lets FLOW
// draft to a person you referenced by role/name without typing their email.
async function _resolveRecipientFromInbox(workspaceId, question) {
  try {
    const m = String(question).match(/\bto\s+(?:the\s+)?(.+?)(?:\s+(?:saying|telling|tell|say|that|about|regarding|re:?)\b|["']|$)/i);
    const target = (m && m[1] || '').trim().toLowerCase();
    if (!target || target.length < 2) return null;
    const tokens = target.split(/\s+/).filter(w => w.length > 2 && !['the', 'our', 'their', 'vp', 'ceo', 'cto', 'team', 'guy', 'lead'].includes(w));
    const { query: queryEvents } = await import('../events/EventStore.js');
    const since = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    const rows = await queryEvents({ workspaceId, connector: 'gmail', since, limit: 40, order: 'DESC' });
    const addrRe = /[\w.+-]+@[\w-]+\.[\w.-]+/;
    for (const ev of rows) {
      const from = ev.metadata?.from || '';
      const hay = `${ev.actor?.name || ''} ${from} ${ev.title || ''} ${ev.summary || ''}`.toLowerCase();
      const match = tokens.length ? tokens.some(t => hay.includes(t)) : false;
      if (match && addrRe.test(from)) {
        return { email: (from.match(addrRe) || [])[0], name: ev.actor?.name || null };
      }
    }
  } catch { /* best-effort */ }
  return null;
}

async function _composeActionDraft(question, { workspaceId, userName }) {
  if (isEmailCompose(question)) {
    const d = await composeEmailDraft(question, { userName });
    if (d?.to) return { kind: 'email', ...d, recommendation: { connector: 'gmail', actionType: 'send', title: `Email ${d.to}`, payload: { to: d.to, subject: d.subject, body: d.body } } };
  }
  // Slack / Jira are checked BEFORE looksLikeCompose — "send a slack message" also
  // matches the loose email-compose pattern, and a Jira "create ticket" must not fall
  // through to the GitHub-issue composer.
  if (isSlackCompose(question)) { const d = await composeSlackDraft(question); if (d) return d; }
  if (isJiraAction(question))   { const d = await composeJiraDraft(question);  if (d) return d; }
  // Compose intent with a NAMED (not typed) recipient → resolve from the inbox.
  if (looksLikeCompose(question)) {
    const who = await _resolveRecipientFromInbox(workspaceId, question);
    if (who?.email) {
      const augmented = question.replace(/\bto\s+(?:the\s+)?.+?(?=\s+(?:saying|telling|tell|say|that|about|regarding|re:?)\b|$)/i, `to ${who.email}`);
      const d = await composeEmailDraft(augmented, { userName });
      if (d?.to) return { kind: 'email', ...d, recipientName: who.name || d.recipientName, recommendation: { connector: 'gmail', actionType: 'send', title: `Email ${d.to}`, payload: { to: d.to, subject: d.subject, body: d.body } } };
    }
    return { kind: 'needs_info', ask: "Who should I send it to? Give me their email, e.g. \"email dana@techcorp.com saying …\"." };
  }
  if (isIssueCompose(question)) {
    const d = await composeIssueDraft(question, { workspaceId });
    if (d?.needsRepo) return { kind: 'needs_info', ask: "Which repository? Try: \"create an issue in flow-os-backend titled '…'\"." };
    if (d) return d;
  }
  if (isMeetingCompose(question)) {
    return composeMeetingDraft(question, { userName });
  }
  return null;
}

// When the user confirms ("yeah do it"), FLOW must DO what it just offered — not
// re-answer. Rewrite the turn into an execution instruction grounded in the last
// thing FLOW said, so the pipeline produces the concrete result (the actual draft).
function _confirmationInstruction(history = []) {
  const lastAssistant = [...(history || [])].reverse().find(m => m.role === 'assistant');
  if (!lastAssistant?.content) return null;
  return `The user just confirmed and wants you to proceed. Carry out exactly what you offered at the end of your previous message — produce the concrete result now (for example, the actual drafted email or message, ready to review), not another summary or a restatement. Do NOT repeat your previous answer. Your previous message was:\n"${String(lastAssistant.content).slice(0, 600)}"`;
}

// "Who am I?" is an identity question — answer it directly with the user's name.
// (Routing it through the brain can lead with unrelated work, e.g. "your latest ticket".)
function isIdentityQuestion(q) {
  return /^\s*(who am i|who'?s this|what'?s my name|what is my name)\b[\s?]*$/i.test(String(q || ''));
}

// A request for a DIFFERENT workspace's data. Retrieval is already tenant-scoped
// (so no data can leak), but the LLM can still verbally CLAIM to access it — a
// fabrication. FLOW answers honestly that it only sees the current workspace.
function isCrossWorkspaceRequest(q) {
  return /\b(workspace|tenant|org(anization)?)[_\s-]?[a-z0-9]/i.test(String(q || ''))
    && /\b(show|get|pull|access|from|switch to|data (from|for)|see)\b/i.test(String(q || ''))
    && /workspace_[a-z0-9]|another (workspace|company|tenant)|other (workspace|tenant)|different workspace/i.test(String(q || ''));
}

// Bulk/destructive requests must never be answered as if FLOW just did them. FLOW
// states the human-in-the-loop guarantee — real execution only runs through the
// governed, approval-gated pipeline.
function isDestructiveBulk(q) {
  const t = String(q || '');
  return /\b(merge|delete|close|cancel|remove|drop|archive|send|email)\s+(all|every|everything)\b/i.test(t)
    || /\bwithout\s+(a\s+)?(review|approval|asking|confirmation)\b/i.test(t)
    || /\bauto[- ]?approve\b/i.test(t)
    || /\bdelete all (our |the )?data\b/i.test(t);
}

// Context-aware follow-ups — the next move a teammate would offer, derived from
// what the conversation is actually about. Never generic filler.
// Follow-ups are generated ONLY from the active capability — never a mix of domains
// (requirement 6). An email answer offers Reply/Archive/Mark Read; a GitHub answer
// offers Review PR/Merge/Open Issue. The primary capability comes from the brain's
// own plan, so the suggestions can never drift to an unrelated connector.
function _followUps(primaryCapability) {
  const scoped = followUpsForCapability(primaryCapability);
  if (scoped.length) return scoped.slice(0, 3);
  // Only broad/general answers (no single owning capability) get generic prompts.
  return ["What should I focus on?", "What's the biggest risk right now?"];
}

// Placeholder locals/names that must never be shown to the user as their name.
const _BAD_NAME = /^(dev|admin|user|test|owner|root|guest|demo|flow|noreply|no-reply)$/i;

// Resolve the user's real display name. The JWT doesn't carry it, so the
// authoritative source is the User row (fullName). Falls back to a client-provided
// name, then an email-derived name — but never a placeholder like "Dev".
async function _resolveUserName(req) {
  // 1. Authoritative: the fullName stored at signup.
  try {
    if (req.user?.id) {
      const { prisma } = await import('../core/config/prisma.js');
      const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { fullName: true } });
      const fn = (u?.fullName || '').trim();
      if (fn && !_BAD_NAME.test(fn)) return fn;
    }
  } catch { /* fall through */ }

  // 2. Client-provided (localStorage) — but not a placeholder.
  const fromBody = typeof req.body?.userName === 'string' ? req.body.userName.trim() : '';
  if (fromBody && !_BAD_NAME.test(fromBody)) return fromBody;

  // 3. Email-derived — skip placeholder locals like "dev@flow-os.local".
  const email = req.user?.email || '';
  if (email.includes('@')) {
    const local = email.split('@')[0];
    if (!_BAD_NAME.test(local)) {
      const name = local.replace(/[._-]+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
      if (name) return name;
    }
  }
  return null; // no real name — FLOW greets without one, never "Dev"
}

const router = express.Router();

// ── Briefing ─────────────────────────────────────────────────────────────────

router.get('/briefing', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const role = (req.query.role || 'EMPLOYEE').toUpperCase();
  try {
    const briefing = await generateBriefing(workspaceId, req.workspace?.orgId, role);
    res.json({ success: true, briefing });
  } catch (err) {
    next(err);
  }
});

// ── Copilot ───────────────────────────────────────────────────────────────────

router.post('/copilot', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const {
    question, pageContext, entityId,
    healthScore, hasIncidents, isInboxZero,
    taskJustDone, deploymentSuccess, sprintCompleted,
    history = [],
  } = req.body;
  if (!question) return next(new ValidationError('question is required'));

  const copilotUserName = await _resolveUserName(req);

  // Greetings open with a proactive, connector-cited pulse — never the brain.
  if (isGreeting(question)) {
    try {
      const { text, suggestions } = await composeProactiveGreeting(workspaceId, { userName: copilotUserName });
      return res.json({ success: true, answer: text, response: text, isCasual: true, followUps: suggestions, sources: [], actions: [] });
    } catch { /* fall through to normal copilot */ }
  }

  // Actionable intent → return a reviewable draft (email / issue / meeting).
  if (isEmailCompose(question) || isSlackCompose(question) || isJiraAction(question) || looksLikeCompose(question) || isIssueCompose(question) || isMeetingCompose(question)) {
    try {
      const draft = await _composeActionDraft(question, { workspaceId, userName: copilotUserName });
      if (draft?.kind === 'needs_info') {
        return res.json({ success: true, answer: draft.ask, response: draft.ask, sources: [], actions: [] });
      }
      if (draft?.recommendation) {
        const intro = draft.kind === 'email' ? `Draft ready for ${draft.recipientName || draft.to}. Review it below.` : `${draft.title}. Review it below.`;
        return res.json({ success: true, answer: intro, response: intro, type: 'action_draft', draft, sources: [], actions: [] });
      }
    } catch { /* fall through */ }
  }

  // Confirmation ("yeah do it") → carry out the prior offer; no history → ask once.
  const cCopilot = isConfirmation(question) ? _confirmationInstruction(history) : null;
  if (isConfirmation(question) && !cCopilot) {
    const { text, suggestions } = vagueClarification();
    return res.json({ success: true, answer: text, response: text, isCasual: true, followUps: suggestions, sources: [], actions: [] });
  }

  // Vague commands get a clarification — unless prior conversation can resolve them.
  if (isVague(question) && !cCopilot && !history.length) {
    const { text, suggestions } = vagueClarification();
    return res.json({ success: true, answer: text, response: text, isCasual: true, followUps: suggestions, sources: [], actions: [] });
  }

  try {
    const result = await answerCopilotQuery(workspaceId, {
      question: cCopilot || question,
      pageContext,
      entityId,
      role:              req.user?.role || 'EMPLOYEE',
      healthScore,
      hasIncidents:      hasIncidents     ?? false,
      isInboxZero:       isInboxZero      ?? false,
      taskJustDone:      taskJustDone     ?? false,
      deploymentSuccess: deploymentSuccess ?? false,
      sprintCompleted:   sprintCompleted  ?? false,
      userName:          copilotUserName,
    });
    const payload = { success: true, ...result };
    if (req.body.explain === true) {
      payload.explanation = await explain(result, { workspaceId, entityId, question });
    }
    // Natural Language Operations: if the response is actionable, include a plan.
    if (!payload.plan) {
      try {
        const { buildPlan } = await import('../execution/actionPlanner.js');
        const text = String(result.response || result.message || '').toLowerCase();
        const ACTIONABLE_PATTERNS = [
          /assign\s+\w+/i, /merge\s+(pr|pull request)/i, /approve\s+\w+/i,
          /create\s+(issue|ticket|pr)/i, /notify\s+\w+/i, /deploy\s+\w+/i,
          /reschedule\s+\w+/i, /review\s+(pr|pull request)/i,
        ];
        const isActionable = ACTIONABLE_PATTERNS.some((p) => p.test(text));
        if (isActionable && result.actions?.length) {
          const steps = result.actions
            .filter((a) => a.connector && a.actionType)
            .map((a) => ({ connector: a.connector, actionType: a.actionType, payload: a.payload || {}, title: a.label || a.title || a.actionType }))
            .slice(0, 3);
          if (steps.length) {
            payload.plan = buildPlan({ title: question, steps });
          }
        }
      } catch { /* NL bridge is best-effort — never breaks the copilot */ }
    }
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

// ── Copilot — token-streamed (perceived speed; "the Brain feels alive") ────────
// SSE. Emits: status (progressive reasoning stages) → actions (ready before the
// prose) → token (true synthesis token stream) → done (full assembled answer +
// explanation). Excluded from the request timeout via the '/stream' suffix.
router.post('/copilot/stream', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));
  const { question, pageContext, entityId, history = [] } = req.body;
  if (!question) return next(new ValidationError('question is required'));

  // The user's display name isn't in the JWT — accept it from the client (display
  // only, not a security boundary), else derive a friendly name from their email.
  const userName = await _resolveUserName(req);

  // Runtime diagnostics (dev-only, header-based): shows FLOW MODE / WORKSPACE /
  // RETRIEVAL SOURCE / LIVE CONNECTORS so the environment distinction is observable.
  // Never shown to normal users; only present outside production for debugging.
  try {
    const { FLOW_ENV, CERTIFICATION_WORKSPACE, isProduction } = await import('../config/flowEnv.js');
    if (!isProduction()) {
      const isCertWs = workspaceId === CERTIFICATION_WORKSPACE;
      res.setHeader('x-flow-mode', isCertWs ? 'certification' : FLOW_ENV);
      res.setHeader('x-flow-workspace', String(workspaceId));
      res.setHeader('x-flow-retrieval-source', isCertWs ? 'INTERNAL_CERTIFICATION_DATA' : 'workspace');
    }
  } catch { /* diagnostics are best-effort */ }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  let closed = false;
  req.on('close', () => { closed = true; });
  const send = (obj) => { if (!closed) res.write(`data: ${JSON.stringify(obj)}\n\n`); };

  // Stage timing — emitted with each status event so the client can render
  // a progress track ("Checking GitHub... 320ms ✓ → Building context...").
  const stageOrder = ['planning', 'retrieving', 'reasoning', 'verifying', 'synthesizing'];
  let stageStartMs = Date.now();
  let stageIndex   = 0;

  // ── Proactive greeting bypass ─────────────────────────────────────────────
  // A greeting must NOT run the reasoning pipeline (which would dump capability
  // jargon). Instead, FLOW inspects the live connectors and opens with real,
  // cited workspace activity — proving it understands the work before being asked.
  if (isGreeting(question)) {
    try {
      send({ type: 'status', stage: 'retrieving', message: 'Checking your connected tools' });
      const { text, suggestions } = await composeProactiveGreeting(workspaceId, { userName });
      send({ type: 'actions', actions: (suggestions || []).map(s => ({ label: s, type: 'suggestion' })) });
      // Stream the greeting word-by-word so it feels alive.
      for (const chunk of text.match(/\S+\s*/g) || [text]) {
        if (closed) break;
        send({ type: 'token', delta: chunk });
        await new Promise(r => setTimeout(r, 12));
      }
      send({ type: 'done', answer: text, confidence: null, actions: (suggestions || []).map(s => ({ label: s })), explanation: null });
      return res.end();
    } catch {
      // If the pulse fails, fall through to normal reasoning rather than erroring.
    }
  }

  // ── Identity — answer directly, never route to the brain ──────────────────
  if (isIdentityQuestion(question)) {
    const text = userName
      ? `You're ${userName}. You're the owner of this workspace — want me to show what you're working on?`
      : "You're the owner of this workspace. Want me to show what you're working on?";
    for (const chunk of text.match(/\S+\s*/g) || [text]) { if (closed) break; send({ type: 'token', delta: chunk }); await new Promise(r => setTimeout(r, 12)); }
    send({ type: 'done', answer: text, confidence: null, actions: [], explanation: null });
    return res.end();
  }

  // ── Cross-workspace request — answer honestly, never claim access to another ──
  if (isCrossWorkspaceRequest(question)) {
    const text = "I can only see this workspace — I don't have access to any other workspace's data, and I won't pretend to. Ask me about what's happening here and I'll pull it up.";
    for (const chunk of text.match(/\S+\s*/g) || [text]) { if (closed) break; send({ type: 'token', delta: chunk }); await new Promise(r => setTimeout(r, 10)); }
    send({ type: 'done', answer: text, confidence: 95, actions: [], explanation: null });
    return res.end();
  }

  // ── Destructive / bulk request — FLOW never acts without approval ──────────
  if (isDestructiveBulk(question)) {
    const text = "I won't run anything that merges, deletes, or sends in bulk without your explicit sign-off — those go through a review step first, and the riskier ones need a second approver. Tell me the specific one and I'll tee it up for you to approve.";
    for (const chunk of text.match(/\S+\s*/g) || [text]) { if (closed) break; send({ type: 'token', delta: chunk }); await new Promise(r => setTimeout(r, 10)); }
    send({ type: 'done', answer: text, confidence: 95, actions: [], explanation: null });
    return res.end();
  }

  // ── Actionable intent → reviewable draft (email / issue / meeting) ────────
  // Every draft carries a governed `recommendation`; the client executes it via
  // /api/execution/execute after the human approves. Nothing auto-runs.
  if (isEmailCompose(question) || isSlackCompose(question) || isJiraAction(question) || looksLikeCompose(question) || isIssueCompose(question) || isMeetingCompose(question)) {
    try {
      send({ type: 'status', stage: 'synthesizing', message: 'Preparing the action' });
      const draft = await _composeActionDraft(question, { workspaceId, userName });
      if (draft?.kind === 'needs_info') {
        for (const chunk of draft.ask.match(/\S+\s*/g) || [draft.ask]) { if (closed) break; send({ type: 'token', delta: chunk }); await new Promise(r => setTimeout(r, 10)); }
        send({ type: 'done', answer: draft.ask, confidence: null, actions: [], explanation: null });
        return res.end();
      }
      if (draft?.recommendation) {
        const intro = draft.kind === 'email'
          ? `Draft ready for ${draft.recipientName || draft.to}. Review it below.`
          : `${draft.title}. Review it below.`;
        for (const chunk of intro.match(/\S+\s*/g) || [intro]) { if (closed) break; send({ type: 'token', delta: chunk }); await new Promise(r => setTimeout(r, 10)); }
        send({ type: 'draft', draft });
        send({ type: 'done', answer: intro, draft, confidence: null, actions: [], explanation: null });
        return res.end();
      }
    } catch { /* fall through to normal reasoning */ }
  }

  // ── Confirmation → carry out the offer ("yeah do it") ─────────────────────
  // With prior conversation, a confirmation means "do what you just offered".
  // With none, it references nothing — ask once, clearly.
  let effectiveQuestion = question;
  const confirmInstruction = isConfirmation(question) ? _confirmationInstruction(history) : null;
  if (isConfirmation(question) && !confirmInstruction) {
    const { text, suggestions } = vagueClarification();
    send({ type: 'actions', actions: (suggestions || []).map(s => ({ label: s, type: 'suggestion' })) });
    for (const chunk of text.match(/\S+\s*/g) || [text]) {
      if (closed) break;
      send({ type: 'token', delta: chunk });
      await new Promise(r => setTimeout(r, 10));
    }
    send({ type: 'done', answer: text, confidence: null, actions: [], explanation: null });
    return res.end();
  }
  if (confirmInstruction) effectiveQuestion = confirmInstruction;

  // ── Vague command bypass ──────────────────────────────────────────────────
  // "do that for me" references nothing — ask what. But if there's prior
  // conversation, let reasoning resolve the pronoun instead of asking.
  if (isVague(question) && !confirmInstruction && !history.length) {
    const { text, suggestions } = vagueClarification();
    send({ type: 'actions', actions: (suggestions || []).map(s => ({ label: s, type: 'suggestion' })) });
    for (const chunk of text.match(/\S+\s*/g) || [text]) {
      if (closed) break;
      send({ type: 'token', delta: chunk });
      await new Promise(r => setTimeout(r, 10));
    }
    send({ type: 'done', answer: text, confidence: null, actions: (suggestions || []).map(s => ({ label: s })), explanation: null });
    return res.end();
  }

  try {
    const brain = await runReasoning(
      workspaceId,
      // Chat runs in fast mode: one LLM call (the final answer), heuristic for the
      // intermediate stages. The deep /api/brain/reason endpoint stays full-quality.
      { question: effectiveQuestion, pageContext, entityId, role: req.user?.role || 'EMPLOYEE', fast: true, history, userName, userId: req.user?.id || null },
      {
        onStatus: (stage, message) => {
          // Abort check — throws so OperationalBrain stops at the next stage boundary
          if (closed) { const e = new Error('Client disconnected'); e.abort = true; throw e; }
          const now     = Date.now();
          const prevMs  = stageIndex > 0 ? now - stageStartMs : 0;
          const idx     = stageOrder.indexOf(stage);
          if (idx >= 0) { stageIndex = idx; stageStartMs = now; }
          send({ type: 'status', stage, message, stageIndex, totalStages: stageOrder.length, prevDurationMs: prevMs });
        },
        onPartial: (kind, data) => {
          // actionPlan shape: { recommendedActions, executableActions } — surface both
          if (kind === 'actions') {
            const actions = data?.recommendedActions || data?.recommended || data?.actions || [];
            if (actions.length) send({ type: 'actions', actions });
          }
          if (kind === 'evidence') send({ type: 'evidence', evidence: data || [] });
        },
        onToken:   (delta) => send({ type: 'token', delta }),
      },
    );

    let explanation = null;
    try { explanation = await explain(brain, { workspaceId, entityId, question }); } catch { /* explanation is optional */ }

    const answer = brain.answer || brain.summary || '';
    // A good teammate always offers the next move — but ONLY within the capability
    // this answer is about. Follow-ups come from the brain's active capability, so a
    // Gmail answer can never suggest a GitHub action (requirement 6).
    const primaryCap = brain.capabilities?.primary || brain.plan?.primaryCapability || null;
    let followUps = _followUps(primaryCap);
    if (followUps.length) send({ type: 'actions', actions: followUps.map(s => ({ label: s, type: 'suggestion' })) });

    send({
      type: 'done',
      answer,
      confidence: brain.confidence?.score ?? brain.confidence ?? null,
      actions: followUps.map(s => ({ label: s })),
      explanation,
    });
    res.end();
  } catch (err) {
    // Abort errors mean the client disconnected — end silently, no error event
    if (!err?.abort) send({ type: 'error', error: err.message });
    res.end();
  }
});

// ── Greeting (Phase 9.6) ─────────────────────────────────────────────────────
// Returns a personalized greeting for the current user session.
// Deduplicated per 6 hours via Redis. force=true bypasses dedup.

router.get('/greeting', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const greeting = await getGreeting({
      workspaceId,
      userId:        req.user?.id,
      userName:      await _resolveUserName(req),
      healthScore:   req.query.healthScore ? Number(req.query.healthScore) : undefined,
      forceGenerate: req.query.force === 'true',
    });
    res.json({ success: true, greeting });
  } catch (err) {
    next(err);
  }
});

// ── Continue (Phase 9.7) ─────────────────────────────────────────────────────
// Resolve last conversation context — used when user says "continue" or "keep going".

router.get('/continue', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const lastCtx = await getLastContext(workspaceId);
    if (!lastCtx) {
      return res.json({
        success: true,
        hasContext: false,
        answer: "I don't have any recent context to continue from. What would you like to explore?",
      });
    }

    const continueAnswer = `Picking up where we left off.\n\n${lastCtx.summary}\n\nWant me to go deeper on this?`;
    return res.json({
      success:         true,
      hasContext:      true,
      answer:          continueAnswer,
      followUps:       lastCtx.followUps || [],
      followUpQuestion: 'Want me to go deeper on this?',
      domain:          lastCtx.domain || 'general',
      lastQuestion:    lastCtx.question || null,
    });
  } catch (err) {
    next(err);
  }
});

// ── Joke (Phase 9.6) ──────────────────────────────────────────────────────────
// Explicit joke request endpoint. Still blocked during incidents/critical contexts.

router.get('/joke', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const joke = await getJoke(workspaceId, {
      hasIncidents: req.query.hasIncidents === 'true',
    });
    res.json({ success: true, joke });
  } catch (err) {
    next(err);
  }
});

// ── Operational Reasoning (Phase 9.1) ────────────────────────────────────────

router.post('/reason', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const { question, pageContext, entityId, role } = req.body;
  if (!question?.trim()) return next(new ValidationError('question is required'));

  try {
    const result = await runReasoning(workspaceId, {
      question: question.trim(),
      pageContext,
      entityId,
      role: role || req.user?.role || 'EMPLOYEE',
    });
    const payload = { success: true, ...result };
    // Opt-in explanation envelope (adds latency, so off by default).
    if (req.body.explain === true || req.query.explain === 'true') {
      payload.explanation = await explain(result, {
        workspaceId, entityId, domain: result.reasoning?.domain, question: question.trim(),
      });
    }
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

// ── Organizational Memory ─────────────────────────────────────────────────────

router.get('/memory', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const hours = parseInt(req.query.hours) || 168;
  try {
    const [records, stats] = await Promise.all([
      queryAllMemory(workspaceId, { hours, limit: 50 }),
      getMemoryStats(workspaceId)
    ]);
    res.json({ success: true, records, stats });
  } catch (err) {
    next(err);
  }
});

// ── Operational Graph ─────────────────────────────────────────────────────────

router.get('/graph', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const entityId = req.query.entityId;
  try {
    const [stats, neighbors] = await Promise.all([
      getGraphStats(workspaceId),
      entityId ? getNeighbors(workspaceId, entityId) : Promise.resolve([])
    ]);
    res.json({ success: true, stats, neighbors });
  } catch (err) {
    next(err);
  }
});

// ── Decisions ──────────────────────────────────────────────────────────────────

router.get('/decisions', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const hours = parseInt(req.query.hours) || 168;
  const limit = parseInt(req.query.limit) || 20;
  try {
    const decisions = await listDecisions(workspaceId, { hours, limit });
    res.json({ success: true, decisions });
  } catch (err) {
    next(err);
  }
});

router.post('/decisions', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const decision = req.body?.recommendation
      ? await fromRecommendation(workspaceId, req.workspace?.orgId, req.body.recommendation)
      : await createDecision(workspaceId, req.workspace?.orgId, req.body || {});
    res.status(201).json({ success: true, decision });
  } catch (err) {
    next(err);
  }
});

router.patch('/decisions/:id', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const decision = await updateDecision(workspaceId, req.params.id, req.body || {});
    res.json({ success: true, decision });
  } catch (err) {
    next(err);
  }
});

// ── Recommendations ────────────────────────────────────────────────────────────

router.get('/recommendations', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const recommendations = getProactiveRecommendations(workspaceId);
    res.json({ success: true, recommendations });
  } catch (err) {
    next(err);
  }
});

router.post('/recommendations/execute', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const { recommendation } = req.body || {};
  if (!recommendation) return next(new ValidationError('recommendation is required'));

  try {
    const decision = await fromRecommendation(workspaceId, req.workspace?.orgId, recommendation);
    if (recommendation.id) recordRecommendationFeedback(recommendation.id, 'accept');
    res.status(201).json({ success: true, decision });
  } catch (err) {
    next(err);
  }
});

// ── Automations ────────────────────────────────────────────────────────────────

router.get('/automations', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const [rules, runs] = await Promise.all([listRules(workspaceId), listRuns(workspaceId)]);
    res.json({ success: true, rules, runs });
  } catch (err) {
    next(err);
  }
});

router.post('/automations', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const role = req.workspaceRole;
  if (role !== 'ADMIN' && role !== 'OWNER') {
    return next(new AuthorizationError('Automation management requires ADMIN or OWNER role'));
  }

  const { name, trigger, conditions, actions } = req.body || {};
  if (!name || !trigger || !actions) return next(new ValidationError('name, trigger, and actions are required'));

  try {
    const rule = await createRule(workspaceId, req.workspace?.orgId, { name, trigger, conditions, actions });
    res.status(201).json({ success: true, rule });
  } catch (err) {
    next(err);
  }
});

router.patch('/automations/:id/toggle', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const role = req.workspaceRole;
  if (role !== 'ADMIN' && role !== 'OWNER') {
    return next(new AuthorizationError('Automation management requires ADMIN or OWNER role'));
  }

  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') return next(new ValidationError('enabled must be a boolean'));

  try {
    const rule = await toggleRule(workspaceId, req.params.id, enabled);
    res.json({ success: true, rule });
  } catch (err) {
    next(err);
  }
});

router.delete('/automations/:id', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const role = req.workspaceRole;
  if (role !== 'ADMIN' && role !== 'OWNER') {
    return next(new AuthorizationError('Automation management requires ADMIN or OWNER role'));
  }

  try {
    await deleteRule(workspaceId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── Goals ──────────────────────────────────────────────────────────────────────

router.get('/goals', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const goals = await listGoals(workspaceId, { status: req.query.status });
    res.json({ success: true, goals });
  } catch (err) {
    next(err);
  }
});

router.post('/goals', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const { title } = req.body || {};
  if (!title) return next(new ValidationError('title is required'));

  try {
    const goal = await createGoal(workspaceId, req.workspace?.orgId, req.body);
    res.status(201).json({ success: true, goal });
  } catch (err) {
    next(err);
  }
});

router.get('/goals/:id', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const goal = await getGoal(workspaceId, req.params.id);
    if (!goal) return next(new NotFoundError('Goal'));
    res.json({ success: true, goal });
  } catch (err) {
    next(err);
  }
});

router.patch('/goals/:id', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const goal = await updateGoal(workspaceId, req.params.id, req.body || {});
    res.json({ success: true, goal });
  } catch (err) {
    next(err);
  }
});

router.delete('/goals/:id', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    await deleteGoal(workspaceId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/goals/:id/milestones', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const { title } = req.body || {};
  if (!title) return next(new ValidationError('title is required'));

  try {
    const milestone = await addMilestone(workspaceId, req.params.id, req.body);
    res.status(201).json({ success: true, milestone });
  } catch (err) {
    next(err);
  }
});

router.patch('/goals/:goalId/milestones/:milestoneId/complete', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const goal = await completeMilestone(workspaceId, req.params.goalId, req.params.milestoneId);
    res.json({ success: true, goal });
  } catch (err) {
    next(err);
  }
});

router.get('/goals/:id/evaluate', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const evaluation = await evaluateGoal(workspaceId, req.params.id);
    res.json({ success: true, evaluation });
  } catch (err) {
    next(err);
  }
});

// ── Operational Timeline ─────────────────────────────────────────────────────

router.get('/timeline', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const hours = parseInt(req.query.hours) || 168;
  const limit = parseInt(req.query.limit) || 50;
  try {
    const timeline = await getOperationalTimeline(workspaceId, { hours, limit });
    res.json({ success: true, timeline });
  } catch (err) {
    next(err);
  }
});

// ── Cross-Capability Entity Context ──────────────────────────────────────────

router.get('/context/:entityId', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const context = await getEntityContext(workspaceId, req.params.entityId);
    res.json({ success: true, context });
  } catch (err) {
    next(err);
  }
});

export default router;

