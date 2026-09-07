import { ask } from '../ai/BrainRouter.js';
import { buildSummaryPrompt } from '../ai/PromptBuilder.js';
import { TaskType } from '../ai/types.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const VAULT_ROOT = process.env.VAULT_ROOT ?? path.join(os.homedir(), 'FLOW-OS-VAULTS');
import { vectorDatabase } from './vectorStoreService.js';
import { broadcastToWorkspace } from './socketService.js';

/**
 * Aggregates operational intelligence chunks ingested in the past N hours
 * and compiles them into a rolling executive summary markdown file,
 * saving it to the workspace's sandbox.
 * 
 * @param {string|number} workspaceId - Corporate tenant key
 * @param {number} hours - Time window to summarize in hours
 * @returns {Promise<Object|null>} Summary result metadata
 */
export async function generateRollingSummary(workspaceId, hours = 24) {
  const wsIdStr = String(workspaceId);
  const cutoff = new Date(Date.now() - hours * 3600 * 1000);
  
  // 1. Retrieve recent chunks for this workspace
  const recentChunks = vectorDatabase.filter(chunk => 
    chunk.workspaceId === wsIdStr && 
    new Date(chunk.timestamp) >= cutoff
  );
  
  if (recentChunks.length === 0) {
    console.log(`ℹ️ [Summary Service] No recent operational chunks to summarize for Workspace ${workspaceId}`);
    return null;
  }
  
  // 2. Group chunks by source channel
  const grouped = {};
  for (const chunk of recentChunks) {
    const channel = chunk.source || 'general';
    if (!grouped[channel]) grouped[channel] = [];
    grouped[channel].push(chunk.text);
  }
  
  // 3. Build context string
  let context = '';
  for (const [channel, texts] of Object.entries(grouped)) {
    context += `### Channel: ${channel}\n`;
    for (const text of texts) {
      context += `- ${text}\n`;
    }
    context += '\n';
  }
  
  let summaryContent = '';
  
  // 4. Request LLM summary via AI provider layer
  try {
    const { messages } = buildSummaryPrompt({ workspaceId: wsIdStr, chunks: recentChunks, windowDays: Math.ceil(hours / 24) });
    const result = await ask({ taskType: TaskType.SUMMARIZE, messages, maxTokens: 600, temperature: 0.3 });
    summaryContent = (result.text || '').trim();
  } catch (err) {
    console.warn(`⚠️ [Summary Service] AI summary generation failed: ${err.message}. Using fallback.`);
  }
  
  // 5. Fallback summary generation
  if (!summaryContent) {
    summaryContent = `# Rolling Executive Summary (${hours}h Rollup)
*Generated at ${new Date().toISOString()} for Workspace ${workspaceId}*

## Executive Summary
Automatic rollup of ${recentChunks.length} operational context chunk(s) across ${Object.keys(grouped).length} channel(s).

## Key Highlights
${Object.entries(grouped).map(([channel, texts]) => `
### Channel: ${channel}
${texts.map(t => `- ${t}`).join('\n')}
`).join('\n')}
`;
  }
  
  // 6. Save to configured vault path.
  const summaryDir = path.join(VAULT_ROOT, `workspace_${workspaceId}`, 'daily_summaries');
  await fs.mkdir(summaryDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(summaryDir, `summary_${timestamp}.md`);
  await fs.writeFile(filePath, summaryContent, 'utf-8');
  
  console.log(`💾 [Summary Service] Saved rolling summary to vault: ${filePath}`);
  
  // 7. Broadcast telemetry notification to dashboard client
  broadcastToWorkspace(wsIdStr, 'ROLLING_SUMMARY_READY', {
    workspaceId,
    filePath,
    timestamp,
    chunkCount: recentChunks.length
  });
  
  return {
    filePath,
    summaryContent,
    chunkCount: recentChunks.length
  };
}
