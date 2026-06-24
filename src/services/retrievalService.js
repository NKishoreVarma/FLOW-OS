/**
 * FLOW OS — Enterprise RAG Context Retriever
 *
 * Primary path  : pgvector DB query with Gemini embeddings + authority weighting
 * Fallback path : Local vault filesystem scan when DB/API are unavailable
 *
 * The fallback mirrors the exact vault directory structure written by vaultService.js:
 *   /Users/kishorevarma/Desktop/FLOW-OS-VAULTS/workspace_<id>/<channel>/intel_*.md
 */

import fs   from 'fs/promises';
import path from 'path';
import pg   from 'pg';
import { broadcastToWorkspace } from './socketService.js';
import { extractEntitiesFromText, getRelatedContext } from './knowledgeGraphService.js';

let dbPool = null;
function getDbPool() {
  if (!dbPool) {
    const { Pool } = pg;
    dbPool = new Pool({
      connectionString: 'postgresql://localhost:5432/postgres'
    });
  }
  return dbPool;
}

// ── Authority Weight Matrix (OpenHuman specification) ──────────────────────────
const AUTHORITY_WEIGHTS = {
  github:   1.5,
  obsidian: 1.5,
  vault:    1.5,
  git:      1.5,
  slack:    0.8,
  gmail:    0.8,
  chat:     0.8,
  discord:  0.8,
  default:  1.0
};

// Root path that vaultService.js writes into
const VAULT_ROOT = '/Users/kishorevarma/Desktop/FLOW-OS-VAULTS';

function resolveAuthorityWeight(platform) {
  if (!platform) return AUTHORITY_WEIGHTS.default;
  return AUTHORITY_WEIGHTS[String(platform).toLowerCase()] ?? AUTHORITY_WEIGHTS.default;
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Generates a real embedding using the Gemini API.
 * Lazily initialises the SDK — only when GEMINI_API_KEY is confirmed present.
 *
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function generateEmbedding(text) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set — embedding generation unavailable.');
  }
  const { GoogleGenAI } = await import('@google/genai');
  const aiOptions = { apiKey: process.env.GEMINI_API_KEY };
  if (process.env.GEMINI_BASE_URL) {
    aiOptions.httpOptions = { baseUrl: process.env.GEMINI_BASE_URL };
  }
  const ai = new GoogleGenAI(aiOptions);

  const response = await ai.models.embedContent({
    model:    'text-embedding-004',
    contents: text
  });

  const values = response?.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('[Retrieval] Empty embedding returned from Gemini API.');
  }
  return values;
}

// ── FALLBACK: Local vault filesystem scanner ───────────────────────────────────
/**
 * Scans local vault Markdown files for workspace_<id> when the DB is unreachable.
 * Mirrors the directory layout written by vaultService.js exactly.
 *
 * Scoring logic:
 *   - Keyword hit in filename OR content body → base score 0.80
 *   - Vault-sourced file always gets the 1.5× authority coefficient
 *   - Final weighted score = baseCosine × authorityCoeff
 *
 * @param {string} workspaceId
 * @param {string} queryText
 * @returns {Promise<Array>} Formatted result array matching the API response shape
 */
export async function vaultFallbackScan(workspaceId, queryText) {
  // Defensive alignment: handle swapped arguments dynamically if called as (queryText, workspaceId)
  if (typeof workspaceId === 'string' && typeof queryText === 'string') {
    const isFirstArgQuery = workspaceId.includes(' ') || !workspaceId.includes('workspace');
    const isSecondArgWs = queryText.includes('workspace');
    if (isFirstArgQuery && isSecondArgWs) {
      console.log(`⚠️ [Retrieval Fallback] Parameter order swap detected. Aligning workspaceId and queryText.`);
      const temp = workspaceId;
      workspaceId = queryText;
      queryText = temp;
    }
  }

  console.log(`📂 [Retrieval Fallback] Scanning local vault for Workspace ${workspaceId}…`);

  // Resolve target directory name robustly to handle nested, single, or double prefixes
  let wsDir = path.join(VAULT_ROOT, `workspace_${workspaceId}`);
  try {
    await fs.access(wsDir);
  } catch {
    // Attempt alternate directories by adding or removing 'workspace_' prefix
    let cleanId = String(workspaceId).replace(/^workspace_/, '');
    const altDir1 = path.join(VAULT_ROOT, `workspace_${cleanId}`);
    const altDir2 = path.join(VAULT_ROOT, `workspace_workspace_${cleanId}`);
    try {
      await fs.access(altDir1);
      wsDir = altDir1;
    } catch {
      try {
        await fs.access(altDir2);
        wsDir = altDir2;
      } catch {
        console.log(`ℹ️ [Retrieval Fallback] Vault directory not found: ${wsDir} (or alternates)`);
        return [];
      }
    }
  }

  // Collect every *.md file across all channel subdirectories for this workspace
  let allFiles = [];
  try {
    const channelDirs = await fs.readdir(wsDir, { withFileTypes: true });
    for (const entry of channelDirs) {
      if (!entry.isDirectory()) continue;
      const channelPath = path.join(wsDir, entry.name);
      try {
        const files = await fs.readdir(channelPath);
        for (const file of files) {
          if (file.endsWith('.md')) {
            allFiles.push({
              channelName: entry.name,
              filePath:    path.join(channelPath, file),
              fileName:    file
            });
          }
        }
      } catch {
        // Skip unreadable channel directories
      }
    }
  } catch {
    console.log(`ℹ️ [Retrieval Fallback] Failed reading channel subdirectories inside: ${wsDir}`);
    return [];
  }

  if (allFiles.length === 0) {
    console.log(`ℹ️ [Retrieval Fallback] No .md files found in vault for Workspace ${workspaceId}.`);
    return [];
  }

  // Lower minimum token length to 2 to catch terms like "UI", "OS", "DB", "Go"
  const queryTokens = (queryText || '')
    .toLowerCase()
    .split(/\W+/)
    .filter(t => t.length >= 2);

  // Score each file by keyword hit ratio
  const scored = [];
  for (const entry of allFiles) {
    let content = '';
    try {
      content = await fs.readFile(entry.filePath, 'utf8');
    } catch {
      continue; // Skip unreadable files
    }

    const haystack = (entry.fileName + ' ' + content).toLowerCase();
    
    // Calculate hits based on tokens, falling back to a direct match of trimmed query
    let hitCount = queryTokens.filter(token => haystack.includes(token)).length;
    if (hitCount === 0 && queryText && (queryText || "").trim()) {
      const trimmedLower = (queryText || "").trim().toLowerCase();
      if (haystack.includes(trimmedLower)) {
        hitCount = 1;
      }
    }

    // No hits at all — skip this file from results
    if (hitCount === 0) continue;

    // Base score: proportion of query tokens that matched
    const tokenCount = Math.max(queryTokens.length, 1);
    const baseCosine     = parseFloat((hitCount / tokenCount).toFixed(4));
    const authorityCoeff = 1.5; // Vault files always carry the highest trust coefficient

    // Extract a human-readable title from the first Markdown H1, or fall back to filename
    const h1Match = content.match(/^#\s+(.+)$/m);
    const title   = h1Match ? (h1Match[1] || "").trim() : entry.fileName.replace(/\.md$/, '');

    scored.push({
      channelName:    entry.channelName,
      filePath:       entry.filePath,
      title,
      baseCosine,
      authorityCoeff,
      weightedScore:  parseFloat((baseCosine * authorityCoeff).toFixed(4)),
      content,
    });
  }

  if (scored.length === 0) {
    console.log(`ℹ️ [Retrieval Fallback] No keyword matches found for query: "${queryText}"`);
    return [];
  }

  // Sort descending by weighted score, cap at 5 results
  const top5 = scored
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .slice(0, 5);

  console.log(`🎯 [Retrieval Fallback] ${top5.length} vault file(s) matched the query.`);

  // Shape output to match the primary DB path response exactly
  return top5.map((chunk, idx) => ({
    rank:           idx + 1,
    id:             null, // No DB row ID in filesystem mode
    channel:        chunk.channelName,
    platform:       'vault',
    title:          chunk.title,
    authorityCoeff: chunk.authorityCoeff,
    weightedScore:  chunk.weightedScore,
    source:         'vault_fallback',
    markdown: `## [${idx + 1}] ${chunk.title}
> **Platform:** vault | **Authority Coefficient:** ${chunk.authorityCoeff} | **Score:** ${chunk.weightedScore}

${chunk.content}
`
  }));
}

// ── PRIMARY: DB-backed pgvector retrieval ──────────────────────────────────────
/**
 * Enterprise RAG Context Retriever.
 *
 * Attempts the full pgvector + Gemini embedding pipeline first.
 * On any DB or API failure, transparently falls back to the local vault scanner.
 *
 * @param {string|number} workspaceId - Corporate tenant key (multi-tenant isolation enforced)
 * @param {string}        queryText   - The incoming user query string
 * @returns {Promise<Array>}          Top-5 authority-weighted context blocks
 */
export async function vaultFrontmatterScan(workspaceId, flags) {
  let wsDir = path.join(VAULT_ROOT, `workspace_${workspaceId}`);
  try {
    await fs.access(wsDir);
  } catch {
    let cleanId = String(workspaceId).replace(/^workspace_/, '');
    const altDir1 = path.join(VAULT_ROOT, `workspace_${cleanId}`);
    const altDir2 = path.join(VAULT_ROOT, `workspace_workspace_${cleanId}`);
    try {
      await fs.access(altDir1);
      wsDir = altDir1;
    } catch {
      try {
        await fs.access(altDir2);
        wsDir = altDir2;
      } catch {
        return [];
      }
    }
  }

  let allFiles = [];
  try {
    const channelDirs = await fs.readdir(wsDir, { withFileTypes: true });
    for (const entry of channelDirs) {
      if (!entry.isDirectory()) continue;
      const channelPath = path.join(wsDir, entry.name);
      try {
        const files = await fs.readdir(channelPath);
        for (const file of files) {
          if (file.endsWith('.md')) {
            allFiles.push({
              channelName: entry.name,
              filePath:    path.join(channelPath, file),
              fileName:    file
            });
          }
        }
      } catch { }
    }
  } catch { return []; }

  const matched = [];
  for (const entry of allFiles) {
    let content = '';
    try {
      content = await fs.readFile(entry.filePath, 'utf8');
    } catch { continue; }

    const mdContent = content;
    const lowerContent = content.toLowerCase();

    const extract = (key) => {
      const regex = new RegExp(`\\*\\*${key}:\\*\\*\\s*(.+)`, 'i');
      const match = mdContent.match(regex);
      return match ? (match[1] || "").trim() : null;
    };

    const sourceChannel = extract('Source Channel');
    const importanceStr = extract('Importance Score');
    const importance = importanceStr === 'N/A' || !importanceStr ? 0 : parseFloat(importanceStr);
    
    let keep = true;
    
    if (flags.from) {
      if (!lowerContent.includes(`[${flags.from.toLowerCase()}]`)) {
        keep = false;
      }
    }
    if (keep && flags.channel) {
      if (!sourceChannel || sourceChannel.toLowerCase() !== flags.channel.toLowerCase()) {
        keep = false;
      }
    }
    if (keep && flags.priority && flags.priority.toLowerCase() === 'high') {
      if (importance < 0.8) {
        keep = false;
      }
    }
    
    if (keep) {
      const h1Match = content.match(/^#\s+(.+)$/m);
      const title   = h1Match ? (h1Match[1] || "").trim() : entry.fileName.replace(/\.md$/, '');
      matched.push({
        id: null,
        channel: sourceChannel || entry.channelName,
        platform: 'vault',
        title,
        authorityCoeff: 1.5,
        score: 1.0,
        content,
        source: 'vault_frontmatter'
      });
    }
  }
  return matched;
}

export async function retrieveContext(workspaceId, queryText) {
  if (!workspaceId || !queryText) {
    throw new Error('[Retrieval Service] workspaceId and queryText are both required.');
  }

  console.log(`\n🔍 [Retrieval] Starting Cognitive Synthesis Routing for Workspace: ${workspaceId}`);

  const flags = {};
  let semanticQuery = queryText;
  
  const flagRegex = /(?:from|channel|priority):([\w-]+)/gi;
  let match;
  while ((match = flagRegex.exec(queryText)) !== null) {
    const fullMatch = match[0];
    const key = fullMatch.split(':')[0].toLowerCase();
    const val = match[1];
    flags[key] = val;
    semanticQuery = semanticQuery.replace(fullMatch, '');
  }
  semanticQuery = (semanticQuery || "").trim();
  
  let vaultResults = [];
  if (Object.keys(flags).length > 0) {
    console.log(`🧭 [Routing] Structural flags detected:`, flags);
    vaultResults = await vaultFrontmatterScan(workspaceId, flags);
  }
  
  let vectorResults = [];
  if (semanticQuery.length > 0) {
    console.log(`🧭 [Routing] Semantic query detected: "${semanticQuery}"`);
    try {
      const queryEmbedding = await generateEmbedding(semanticQuery);
      const pool = getDbPool();
      const { rows } = await pool.query(
        `SELECT id, workspace_id, channel_name, source_platform, authority_weight, raw_content, (1 - (embedding <=> $1)) AS base_cosine FROM workspace_intel_chunks WHERE workspace_id = $2 ORDER BY embedding <=> $1 LIMIT 20`,
        [`[${queryEmbedding.join(',')}]`, String(workspaceId)]
      );
      vectorResults = rows.map((row) => ({
        id: row.id,
        channel: row.channel_name,
        platform: row.source_platform,
        title: `${row.source_platform.toUpperCase()} Chunk (${row.channel_name})`,
        authorityCoeff: parseFloat(row.authority_weight) || 1.0,
        score: parseFloat(row.base_cosine) || 0,
        content: row.raw_content,
        source: 'vector_db'
      }));
    } catch (e) {
      console.warn(`⚠️ [Routing] Vector DB failed, attempting fallback: ${e.message}`);
      if (vaultResults.length === 0) {
        vectorResults = await vaultFallbackScan(workspaceId, semanticQuery);
      }
    }
  }
  
  vaultResults.sort((a, b) => b.score - a.score);
  vectorResults.sort((a, b) => b.score - a.score);
  
  const rrfMap = new Map();
  
  const applyRRF = (results) => {
    results.forEach((item, index) => {
      const rank = index + 1;
      const rrfScore = 1 / (60 + rank);
      
      const rawContent = item.content || item.markdown || "";
      const hashKey = (rawContent || "").trim().substring(0, 150);
      if (!rrfMap.has(hashKey)) {
        rrfMap.set(hashKey, {
          ...item,
          rrfBase: rrfScore
        });
      } else {
        const existing = rrfMap.get(hashKey);
        existing.rrfBase += rrfScore;
      }
    });
  };
  
  applyRRF(vaultResults);
  applyRRF(vectorResults);
  
  const merged = Array.from(rrfMap.values()).map(item => {
    const finalScore = item.rrfBase * item.authorityCoeff;
    return {
      ...item,
      weightedScore: parseFloat(finalScore.toFixed(4))
    };
  });
  
  const top5 = merged.sort((a, b) => b.weightedScore - a.weightedScore).slice(0, 5);
  
  console.log(`🎯 [Cognitive Router] Merged top ${top5.length} chunks via RRF.`);
  
  broadcastToWorkspace(String(workspaceId), 'COGNITIVE_ROUTING_COMPLETE', {
    workspaceId,
    vectorCount: vectorResults.length,
    vaultCount: vaultResults.length,
    totalMerged: merged.length
  });
  
  return top5.map((chunk, idx) => {
    let finalContent = chunk.content || chunk.markdown || "";
    
    const foundEntities = extractEntitiesFromText(finalContent);
    if (foundEntities.length > 0) {
      const graphContexts = [];
      for (const entityId of foundEntities) {
        const ctx = getRelatedContext(entityId);
        if (ctx.length > 0) graphContexts.push(...ctx);
      }
      
      if (graphContexts.length > 0) {
        const uniqueCtx = [...new Set(graphContexts)];
        finalContent += `\n\n**Knowledge Graph Context (2-Hops):**\n` + uniqueCtx.map(c => `- ${c}`).join('\n');
      }
    }

    return {
      rank:           idx + 1,
      id:             chunk.id,
      channel:        chunk.channel,
      platform:       chunk.platform,
      title:          chunk.title,
      authorityCoeff: chunk.authorityCoeff,
      weightedScore:  chunk.weightedScore,
      source:         chunk.source,
      markdown: `## [${idx + 1}] ${chunk.title}\n> **Platform:** ${chunk.platform} | **Authority Coefficient:** ${chunk.authorityCoeff} | **Score:** ${chunk.weightedScore}\n\n${finalContent}\n`
    };
  });
}

export async function upsertVector(workspaceId, text, channelName) {
  console.log(`📥 [Retrieval Service] Ingesting intel chunk for Workspace ${workspaceId}, Channel ${channelName}...`);
  try {
    let embedding;
    try {
      embedding = await generateEmbedding(text);
    } catch (e) {
      console.warn(`⚠️ [Retrieval Service Ingest] Gemini embedding generation failed, using mock embedding:`, e.message);
      // Fallback mock embedding: 768 dimensions
      embedding = new Array(768).fill(0).map(() => Math.random());
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      embedding = embedding.map(val => val / magnitude);
    }

    // Determine platform
    let platform = 'vault';
    if (channelName.toLowerCase().includes('gmail') || channelName.toLowerCase().includes('email')) {
      platform = 'gmail';
    } else if (channelName.toLowerCase().includes('slack') || channelName.toLowerCase().includes('chat') || channelName.toLowerCase().includes('engineering')) {
      platform = 'slack';
    }

    const weight = resolveAuthorityWeight(platform);
    const pool = getDbPool();

    await pool.query(
      `INSERT INTO workspace_intel_chunks 
       (workspace_id, channel_name, source_platform, authority_weight, raw_content, embedding)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        String(workspaceId),
        channelName,
        platform,
        weight,
        text,
        `[${embedding.join(',')}]`
      ]
    );
    console.log(`✅ [Retrieval Service Ingest] Successfully stored chunk in workspace_intel_chunks.`);
  } catch (err) {
    console.error(`❌ [Retrieval Service Ingest] Failed to insert chunk:`, err.message);
  }
}
