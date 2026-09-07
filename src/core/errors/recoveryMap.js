const RECOVERY_MAP = {
  CONNECTOR_AUTH_EXPIRED: {
    userMessage: 'Your connection expired. Re-authorizing takes about 30 seconds.',
    recoverySteps: [
      'Open Settings → Connections',
      'Click Reconnect next to the affected connector',
      'Sign in with your account',
    ],
    selfServeAction: { label: 'Go to Connections', href: '/admin/ops#connections' },
  },
  WIC_BUILD_FAILED: {
    userMessage: "Morning Brief couldn't load. We're rebuilding it now.",
    recoverySteps: ['Wait 60 seconds', 'Refresh the page'],
    selfServeAction: null,
  },
  APPROVAL_REQUIRED: {
    userMessage: "This action needs approval from a workspace admin. They've been notified.",
    recoverySteps: ["Ask your workspace admin to approve in Settings → Approvals"],
    selfServeAction: { label: 'View Approvals', href: '/settings/audit' },
  },
  RATE_LIMITED: {
    userMessage: "You're moving fast — slow down for a moment and try again.",
    recoverySteps: ['Wait 60 seconds', 'Then retry your action'],
    selfServeAction: null,
  },
  AUTHENTICATION_REQUIRED: {
    userMessage: 'Your session expired. Sign in again to continue.',
    recoverySteps: ['Click Sign In', 'Use your FLOW credentials'],
    selfServeAction: { label: 'Sign In', href: '/login' },
  },
  FORBIDDEN: {
    userMessage: "You don't have permission for this action.",
    recoverySteps: ['Ask your workspace admin to update your role in Settings → Team'],
    selfServeAction: { label: 'Settings → Team', href: '/settings/team' },
  },
  NOT_FOUND: {
    userMessage: 'This item no longer exists or was moved.',
    recoverySteps: ['Refresh the page', 'Search for it using the search bar'],
    selfServeAction: null,
  },
  CONNECTOR_UNAVAILABLE: {
    userMessage: 'This integration is temporarily unavailable.',
    recoverySteps: [
      'Check the connection status in Settings → Connections',
      'Reconnect if the status shows an error',
    ],
    selfServeAction: { label: 'Check Connections', href: '/admin/ops#connections' },
  },
  WORKSPACE_NOT_FOUND: {
    userMessage: 'Workspace not found. This may be a configuration issue.',
    recoverySteps: ['Try signing out and back in', 'Contact your workspace admin'],
    selfServeAction: null,
  },
  INTERNAL_ERROR: {
    userMessage: 'Something unexpected happened on our end.',
    recoverySteps: ['Refresh the page', 'If this keeps happening, use "Report this" to notify us'],
    selfServeAction: null,
  },
  OAUTH_CREDENTIALS_INVALID: {
    userMessage: 'Google OAuth credentials are misconfigured. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file.',
    recoverySteps: [
      'Go to https://console.cloud.google.com/apis/credentials',
      'Find your OAuth 2.0 Client ID and copy the current Client Secret',
      'Update GOOGLE_CLIENT_SECRET in your .env file and restart the server',
    ],
    selfServeAction: { label: 'Open Google Console', href: 'https://console.cloud.google.com/apis/credentials' },
  },
  TOKEN_REVOKED: {
    userMessage: 'GitHub token rejected. Generate a new token with repo and read:user scopes.',
    recoverySteps: [
      'Go to GitHub → Settings → Developer settings → Personal access tokens',
      'Generate a new token with "repo" and "read:user" scopes',
      'Paste the new token in the connection dialog',
    ],
    selfServeAction: { label: 'Open GitHub token settings', href: 'https://github.com/settings/tokens/new?scopes=repo,read:user&description=FLOW+OS' },
  },
  GITHUB_NOT_CONFIGURED: {
    userMessage: 'Enter a GitHub Personal Access Token to connect.',
    recoverySteps: [
      'Go to GitHub → Settings → Developer settings → Personal access tokens',
      'Generate a token with "repo" and "read:user" scopes',
      'Paste the token in the connection dialog',
    ],
    selfServeAction: { label: 'Open GitHub token settings', href: 'https://github.com/settings/tokens/new?scopes=repo,read:user&description=FLOW+OS' },
  },
};

export function getRecovery(code) {
  return RECOVERY_MAP[code] ?? null;
}
