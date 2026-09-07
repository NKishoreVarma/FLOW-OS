/**
 * flowEnv — explicit environment mode for FLOW (certification spec §3 + §22).
 *
 * FLOW runs in exactly one of three modes, resolved once at import:
 *   development   — normal local dev. Synthetic Helios data must NOT auto-load.
 *   certification — the controlled Helios world may be imported into the ONE
 *                   certification workspace (workspace_helios_test) to prove the
 *                   real engine works. Never touches production data.
 *   production    — real customer data. Synthetic data is FORBIDDEN — fail closed.
 *
 * Source of truth: FLOW_ENV env var; falls back to NODE_ENV ('production' → production),
 * otherwise 'development'. Never silently defaults to certification.
 */

export const FlowEnv = Object.freeze({
  DEVELOPMENT:   'development',
  CERTIFICATION: 'certification',
  PRODUCTION:    'production',
});

// The ONE workspace certification is allowed to create / reset / import into.
export const CERTIFICATION_WORKSPACE = 'workspace_helios_test';

function resolveEnv() {
  const raw = (process.env.FLOW_ENV || '').toLowerCase().trim();
  if (raw === FlowEnv.CERTIFICATION) return FlowEnv.CERTIFICATION;
  if (raw === FlowEnv.PRODUCTION)    return FlowEnv.PRODUCTION;
  if (raw === FlowEnv.DEVELOPMENT)   return FlowEnv.DEVELOPMENT;
  // No explicit FLOW_ENV → derive conservatively from NODE_ENV.
  if ((process.env.NODE_ENV || '').toLowerCase() === 'production') return FlowEnv.PRODUCTION;
  return FlowEnv.DEVELOPMENT;
}

export const FLOW_ENV = resolveEnv();

export const isCertification = () => FLOW_ENV === FlowEnv.CERTIFICATION;
export const isProduction    = () => FLOW_ENV === FlowEnv.PRODUCTION;
export const isDevelopment   = () => FLOW_ENV === FlowEnv.DEVELOPMENT;

/**
 * Hard guard (§22): synthetic / certification data may ONLY be loaded, reset, or
 * imported in certification mode. In production this THROWS (fail closed, not a
 * warning). In development it also refuses — synthetic data must never auto-load
 * outside certification.
 *
 * @param {string} action  human-readable action being attempted (for the error)
 * @param {string} [workspaceId]  target workspace — must be the cert workspace
 */
export function assertCertificationAllowed(action = 'synthetic dataset operation', workspaceId = CERTIFICATION_WORKSPACE) {
  if (FLOW_ENV === FlowEnv.PRODUCTION) {
    throw new Error(
      `REFUSED: ${action} is forbidden in production (FLOW_ENV=production). ` +
      `Synthetic Helios data must never touch production. Fail closed.`,
    );
  }
  if (FLOW_ENV !== FlowEnv.CERTIFICATION) {
    throw new Error(
      `REFUSED: ${action} requires FLOW_ENV=certification (current: ${FLOW_ENV}). ` +
      `Run with FLOW_ENV=certification to operate on the Helios certification world.`,
    );
  }
  if (workspaceId && workspaceId !== CERTIFICATION_WORKSPACE) {
    throw new Error(
      `REFUSED: ${action} may only target ${CERTIFICATION_WORKSPACE} ` +
      `(got: ${workspaceId}). Certification never operates on other workspaces.`,
    );
  }
  return true;
}

/**
 * Destructive-op guard for dataset:reset (§5). Same rules as above; separate name
 * so the call-site intent is explicit in stack traces.
 */
export function assertResetAllowed(workspaceId = CERTIFICATION_WORKSPACE) {
  return assertCertificationAllowed('dataset:reset', workspaceId);
}

/**
 * Governed SANDBOX execution guard. The sandbox executor lets the real execution
 * engine complete a full action lifecycle (record → receipt → event → memory)
 * WITHOUT contacting any external provider — for certification only.
 *
 * Fail closed on every axis:
 *   - NEVER in production (FLOW_ENV=production) — a hard false.
 *   - ONLY the certification workspace — never a dev/live workspace.
 *   - Requires an explicit opt-in: FLOW_ENV=certification OR SANDBOX_EXECUTION_ENABLED=true.
 * So sandbox mode can never be an accidental substitute for a real provider.
 */
export function sandboxExecutionAllowed(workspaceId) {
  if (FLOW_ENV === FlowEnv.PRODUCTION) return false;
  if (String(workspaceId) !== CERTIFICATION_WORKSPACE) return false;
  return FLOW_ENV === FlowEnv.CERTIFICATION || process.env.SANDBOX_EXECUTION_ENABLED === 'true';
}

export function assertSandboxExecutionAllowed(workspaceId) {
  if (!sandboxExecutionAllowed(workspaceId)) {
    throw new Error(
      `REFUSED: SANDBOX execution is not allowed for workspace "${workspaceId}" (FLOW_ENV=${FLOW_ENV}). ` +
      `Sandbox is fail-closed: certification workspace only, explicit opt-in, never production.`,
    );
  }
  return true;
}

export default {
  FlowEnv, FLOW_ENV, CERTIFICATION_WORKSPACE,
  isCertification, isProduction, isDevelopment,
  assertCertificationAllowed, assertResetAllowed,
  sandboxExecutionAllowed, assertSandboxExecutionAllowed,
};
