import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const VAULT_ROOT = process.env.VAULT_ROOT ?? path.join(os.homedir(), 'FLOW-OS-VAULTS');

/**
 * Saves filtered Markdown text files directly into workspace-sandboxed structures on the Desktop.
 * Segmented by corporate workspace ID and origin channel name.
 * 
 * @param {string|number} workspaceId - Corporate tenant key
 * @param {string} channelName - Origin/source channel name (e.g. C_ENGINEERING)
 * @param {string} content - Raw operational text to persist
 * @returns {Promise<string>} The generated absolute file path
 */
export async function saveToVault(workspaceId, channelName, content, metadata = {}) {
  if (!workspaceId) {
    throw new Error('workspaceId is required to write to corporate vaults.');
  }
  const cleanChannel = String(channelName || 'general').replace(/[^a-zA-Z0-9_-]/g, '_');
  const vaultDir = path.join(VAULT_ROOT, `workspace_${workspaceId}`, cleanChannel);

  // Recursively create directory structure matching sandbox path
  await fs.mkdir(vaultDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `intel_${timestamp}.md`;
  const filePath = path.join(vaultDir, filename);

  // Generate clean Markdown structure with tracing metadata
  const markdownText = `# Operational Intel Report
**Workspace:** ${workspaceId}
**Source Channel:** ${channelName}
**Ingested At:** ${new Date().toISOString()}
**Importance Score:** ${metadata.importance_score ?? 'N/A'}
**Authority Score:** ${metadata.authority_score ?? 'N/A'}
**Urgency Score:** ${metadata.urgency_score ?? 'N/A'}
**Retention Policy:** ${metadata.retention_policy ?? 'N/A'}

---

${content}
`;

  // Persist raw bytes to Desktop vault structure
  await fs.writeFile(filePath, markdownText, 'utf8');
  console.log(`💾 [Vault Service] Saved operational intel to vault: ${filePath}`);
  return filePath;
}
