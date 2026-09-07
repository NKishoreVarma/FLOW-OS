/**
 * FLOW OS — SandboxAdapter (Governed Sandbox Execution Provider)
 *
 * A REAL connector adapter that runs through the existing execution engine
 * (executeAction → governance → adapter.execute → audit → event → memory), but
 * whose `execute()` processes the action LOCALLY and returns an explicitly
 * SANDBOX-labeled receipt. It NEVER contacts an external API and NEVER mutates a
 * real GitHub/Gmail/Slack account.
 *
 * This is NOT a preview/simulated provider that fakes provider success — it is an
 * honest, distinctly-labeled sandbox. Its receipt can never be mistaken for a real
 * provider receipt (executionMode/provider/receiptType = SANDBOX; external=false).
 *
 * Fail closed: every execute() re-asserts `assertSandboxExecutionAllowed()` so the
 * sandbox can only ever run for the certification workspace, never in production,
 * and only under an explicit opt-in. It is not a substitute for a real provider.
 */

import { randomUUID } from 'crypto';
import { BaseAdapter } from '../BaseAdapter.js';
import { Capability, ActionType, AuthStrategy } from '../capabilities.js';
import { assertSandboxExecutionAllowed, sandboxExecutionAllowed } from '../../config/flowEnv.js';

export class SandboxAdapter extends BaseAdapter {
  constructor() {
    super({
      id:           'sandbox',
      name:         'FLOW Sandbox (Governed · No External I/O)',
      capability:   Capability.OPERATIONS,
      authStrategy: AuthStrategy.NONE,
      // Must stay within Capability.OPERATIONS' allowed action set (registry-enforced).
      // The risk classifier keys on actionType, giving full tier coverage:
      //   read/audit → LOW · create/update/execute → MEDIUM ·
      //   delete / execute+mergeMethod → HIGH · execute+mergeMethod+base:main → CRITICAL.
      supportedActions: [
        ActionType.READ, ActionType.SEARCH, ActionType.CREATE, ActionType.UPDATE,
        ActionType.DELETE, ActionType.EXECUTE, ActionType.HEALTH, ActionType.AUDIT,
      ],
      version: '1.0.0',
    });
    // NOT a preview adapter: it does not fabricate a real-provider success. The
    // execution engine's simulated-connector guard must let it through, because it
    // is honest about being a sandbox (never claims to be github/gmail/slack).
    this.simulated = false;
    this.sandbox   = true;
  }

  async healthCheck(workspaceId) {
    return {
      status:   sandboxExecutionAllowed(workspaceId) ? 'HEALTHY' : 'DOWN',
      latencyMs: 0,
      detail:   'Governed sandbox — processes actions locally, contacts no external provider.',
    };
  }

  // Reads are not the sandbox's job — real ingested reads come from the workspace's
  // ingested data via the capability routes. Refuse honestly rather than fabricate.
  async read() {
    return [];
  }

  /**
   * Process a side-effectful action in the sandbox and return a labeled receipt.
   * The receipt is produced ONLY after the action is actually processed here.
   */
  async execute(workspaceId, actionType, payload = {}, approvedBy) {
    // Fail closed — re-checked at the moment of execution, not just at routing time.
    assertSandboxExecutionAllowed(workspaceId);

    const receiptId   = `sbx_${randomUUID()}`;
    const processedAt = new Date().toISOString();

    // Deterministic, local processing. No network. No provider SDK. No mutation.
    const target =
      payload?.number ?? payload?.id ?? payload?.to ?? payload?.key ?? payload?.title ?? null;

    return {
      // ── Mandatory sandbox labels (never a real-provider receipt) ──────────────
      executionMode:        'SANDBOX',
      provider:             'SANDBOX',
      receiptType:          'SANDBOX',
      receiptId,
      // ── Honesty flags ─────────────────────────────────────────────────────────
      external:             false,
      contactedExternalApi: false,
      mutatedRealAccount:   false,
      isRealProviderReceipt: false,
      // ── What was processed ────────────────────────────────────────────────────
      workspaceId:  String(workspaceId),
      actionType,
      target:       target != null ? String(target) : null,
      approvedBy:   approvedBy || null,
      processedAt,
      summary:      `SANDBOX processed "${actionType}"${target != null ? ` on ${target}` : ''}`,
      payloadEcho:  payload,
      note: 'Governed sandbox execution. No external GitHub/Gmail/Slack API was contacted ' +
            'and no real account was mutated. This is NOT a real provider receipt.',
    };
  }
}

export default new SandboxAdapter();
