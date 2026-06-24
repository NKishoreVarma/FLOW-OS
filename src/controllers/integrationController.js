import { Composio } from "@composio/core";

/**
 * Express Controller: Initiates an interactive OAuth connection for a workspace tenant.
 * Expects workspaceId and appName. Enforces strict multi-tenant workspace header checks.
 * 
 * @param {Object} req - Express Request object
 * @param {Object} res - Express Response object
 */
export async function initiateConnection(req, res) {
  try {
    // 1. Enforce strict workspace_id header check for multi-tenant isolation
    const workspaceIdHeader = req.headers['workspace-id'] || req.headers['x-workspace-id'] || req.headers['workspace_id'];
    const { workspaceId, appName } = req.body;

    if (!workspaceIdHeader) {
      return res.status(400).json({
        error: 'Multi-tenant isolation violation: Missing strict workspace_id in headers.'
      });
    }

    // Ensure the request body workspaceId matches the header workspaceId for tenant cross-over safety
    if (workspaceId && String(workspaceId) !== String(workspaceIdHeader)) {
      return res.status(403).json({
        error: 'Workspace ID mismatch between request header and request body.'
      });
    }

    const resolvedWorkspaceId = workspaceIdHeader || workspaceId;

    if (!resolvedWorkspaceId || !appName) {
      return res.status(400).json({
        error: 'Missing required parameters: workspaceId and appName are both required.'
      });
    }

    console.log(`🔌 Initiating production Composio connection for Workspace: ${resolvedWorkspaceId}, App: ${appName}`);

    // ── Lazy SDK initialisation with missing-key guard ──────────────
    // If COMPOSIO_API_KEY is absent (local dev / CI without secrets), return a
    // simulated onboarding URL so the rest of the pipeline stays alive.
    if (!process.env.COMPOSIO_API_KEY) {
      console.warn('⚠️ [Composio] COMPOSIO_API_KEY not set — returning simulated OAuth link for local development.');
      return res.status(200).json({
        redirectUrl: `http://localhost:5000/simulate-oauth?workspace=${resolvedWorkspaceId}&app=${appName}`,
        simulated: true
      });
    }

    // Instantiate the Composio client lazily — only when the key is confirmed present
    const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

    // Use the official SDK method to initiate a connection
    const connectionResult = await composio.connectedAccounts.initiate({
      userId: String(resolvedWorkspaceId),
      appName: appName
    });

    if (!connectionResult || !connectionResult.redirectUrl) {
      // Fallback: Check if the method is available on entity or client for version safety
      let entity;
      if (typeof composio.getEntity === 'function') {
        entity = await composio.getEntity(String(resolvedWorkspaceId));
      } else if (composio.client && typeof composio.client.getEntity === 'function') {
        entity = await composio.client.getEntity(String(resolvedWorkspaceId));
      }

      if (entity && typeof entity.initiateConnection === 'function') {
        const legacyConn = await entity.initiateConnection({ appName });
        if (legacyConn && legacyConn.redirectUrl) {
          return res.status(200).json({ redirectUrl: legacyConn.redirectUrl });
        }
      }

      throw new Error(`Failed to retrieve functional live onboarding redirect URL for app: ${appName}`);
    }

    // Return the live OAuth target URI inside a clean JSON response payload
    return res.status(200).json({ redirectUrl: connectionResult.redirectUrl });
  } catch (error) {
    console.error('[Composio OAuth Integration Error]:', error);
    return res.status(500).json({
      error: 'Failed to initiate Composio connection.',
      details: error.message
    });
  }
}
