/**
 * Validation — Integration Permissions (Phase 13.1)
 *
 * Proves the governance guarantee: a resource the workspace has not authorized
 * never enters the pipeline. Exercises the real permission store (PostgreSQL),
 * the real gate, and the real item/payload shapes emitted by each sync adapter
 * and each provider webhook.
 *
 * Run: node scripts/validate-integration-permissions.js
 */

import 'dotenv/config';

import { prisma } from '../src/core/config/prisma.js';
import {
  isResourceAllowed,
  isWebhookAllowed,
  isResourceIdAllowed,
  filterItems,
  getAllowedResourceIds,
  upsertDiscovered,
  setAllowed,
  updateSettings,
  getSummary,
  clearCache,
  resetLegacyWarnings,
  GateReason,
} from '../src/core/governance/integrationPermissions/index.js';

const WS = `ws_validate_perms_${Date.now()}`;

let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else    { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

/** The cache has a 60s TTL; permission edits inside a test run must be visible. */
function fresh() { clearCache(); }

async function cleanup() {
  await prisma.integrationPermission.deleteMany({ where: { workspaceId: WS } });
  await prisma.integrationPermissionSetting.deleteMany({ where: { workspaceId: WS } });
}

// Real item shapes, copied from the *SyncAdapter outputs.
const slackMsg   = (channelId) => ({ externalId: `${channelId}:1`, platform: 'slack',  channel: 'eng', metadata: { channelId, channelName: 'eng' } });
const ghPR       = (repo)      => ({ externalId: '1', platform: 'github', channel: `pulls:${repo}`,  metadata: { repo, prNumber: 7 } });
const gmailMsg   = (labels)    => ({ externalId: 'm1', platform: 'gmail',  channel: 'inbox',          metadata: { labels } });
const jiraIssue  = (project)   => ({ externalId: 'i1', platform: 'jira',   channel: `issues:${project}`, metadata: { project, key: `${project}-3` } });
const calEvent   = (calendarId)=> ({ externalId: 'e1', platform: 'google-calendar', channel: 'calendar', metadata: { calendarId } });

async function main() {
  console.log('\n🛡️  Integration Permissions — validation\n');
  await cleanup();
  resetLegacyWarnings();

  // ── 1. Deny-by-default ──────────────────────────────────────────────────────
  console.log('1. Deny-by-default');
  {
    fresh();
    const v = await isResourceAllowed(WS, 'slack', slackMsg('C_UNKNOWN'));
    check('undiscovered resource is DENIED', !v.allowed && v.reason === GateReason.UNDISCOVERED, v.reason);

    const u = await isResourceAllowed(WS, 'slack', { metadata: {} });
    check('unattributable item is DENIED (never fails open)', !u.allowed && u.reason === GateReason.UNATTRIBUTABLE, u.reason);
  }

  // ── 2. Discovery seeds a hidden catalog ─────────────────────────────────────
  console.log('\n2. Discovery → catalog');
  {
    await upsertDiscovered(WS, 'slack', [
      { resourceType: 'channel',         resourceId: 'C_ENG',   resourceName: '#engineering' },
      { resourceType: 'channel',         resourceId: 'C_FIN',   resourceName: '#finance' },
      { resourceType: 'private_channel', resourceId: 'G_CEO',   resourceName: 'CEO Office' },
    ]);
    fresh();

    const s = await getSummary(WS, 'slack');
    check('discovered resources default to HIDDEN', s.total === 3 && s.allowed === 0 && s.hidden === 3, JSON.stringify(s));

    const v = await isResourceAllowed(WS, 'slack', slackMsg('C_ENG'));
    check('discovered-but-not-allowed is DENIED', !v.allowed && v.reason === GateReason.HIDDEN, v.reason);
  }

  // ── 3. Explicit allow ───────────────────────────────────────────────────────
  console.log('\n3. Explicit allow');
  {
    await setAllowed(WS, 'slack', [{ resourceType: 'channel', resourceId: 'C_ENG', allowed: true }]);
    fresh();

    const allowed = await isResourceAllowed(WS, 'slack', slackMsg('C_ENG'));
    check('#engineering ALLOWED after opt-in', allowed.allowed && allowed.reason === GateReason.ALLOWED);

    const denied = await isResourceAllowed(WS, 'slack', slackMsg('C_FIN'));
    check('#finance still BLOCKED', !denied.allowed);

    const priv = await isResourceAllowed(WS, 'slack', slackMsg('G_CEO'));
    check('private "CEO Office" still BLOCKED', !priv.allowed);
  }

  // ── 4. filterItems — the SyncEngine chokepoint ──────────────────────────────
  console.log('\n4. Sync batch filtering (SyncEngine door)');
  {
    fresh();
    const batch = [
      slackMsg('C_ENG'),  // allowed
      slackMsg('C_FIN'),  // hidden
      slackMsg('G_CEO'),  // hidden
      slackMsg('C_NEW'),  // undiscovered
    ];
    const { allowed, blocked, allowedResourceIds } = await filterItems(WS, 'slack', batch);

    check('only the allowed channel survives', allowed.length === 1 && allowed[0].metadata.channelId === 'C_ENG');
    check('3 items blocked before the ingestion queue', blocked.length === 3, `blocked=${blocked.length}`);
    check('blocked entries carry no message text', blocked.every(b => !('text' in b)));
    check('allowed resource ids reported for sync stamping', allowedResourceIds.join() === 'C_ENG');
  }

  // ── 5. Re-discovery must not silently re-open hidden resources ──────────────
  console.log('\n5. Re-discovery preserves decisions');
  {
    await upsertDiscovered(WS, 'slack', [
      { resourceType: 'channel', resourceId: 'C_ENG', resourceName: '#engineering (renamed)' },
      { resourceType: 'channel', resourceId: 'C_FIN', resourceName: '#finance' },
      { resourceType: 'private_channel', resourceId: 'G_CEO', resourceName: 'CEO Office' },
      { resourceType: 'channel', resourceId: 'C_BRAND', resourceName: '#brand-new' },
    ]);
    fresh();

    const eng = await isResourceAllowed(WS, 'slack', slackMsg('C_ENG'));
    check('previously allowed stays ALLOWED', eng.allowed);

    const fin = await isResourceAllowed(WS, 'slack', slackMsg('C_FIN'));
    check('previously hidden stays HIDDEN', !fin.allowed);

    const brand = await isResourceAllowed(WS, 'slack', slackMsg('C_BRAND'));
    check('newly appeared channel is HIDDEN by default', !brand.allowed);
  }

  // ── 6. autoAllowNew ─────────────────────────────────────────────────────────
  console.log('\n6. autoAllowNew opt-in');
  {
    await updateSettings(WS, 'slack', { autoAllowNew: true });
    fresh();

    const v = await isResourceAllowed(WS, 'slack', slackMsg('C_NEVER_SEEN'));
    check('undiscovered resource ALLOWED when autoAllowNew=true', v.allowed && v.reason === GateReason.AUTO_ALLOWED, v.reason);

    const fin = await isResourceAllowed(WS, 'slack', slackMsg('C_FIN'));
    check('explicitly hidden is STILL blocked (autoAllowNew never overrides)', !fin.allowed);

    await updateSettings(WS, 'slack', { autoAllowNew: false });
    fresh();
  }

  // ── 7. Slack DM policy ──────────────────────────────────────────────────────
  console.log('\n7. Direct-message policy');
  {
    const dm = slackMsg('D_PRIVATE');

    await updateSettings(WS, 'slack', { dmPolicy: 'NEVER' }); fresh();
    const never = await isResourceAllowed(WS, 'slack', dm);
    check('dmPolicy=NEVER blocks DMs', !never.allowed && never.reason === GateReason.DM_BLOCKED);

    await updateSettings(WS, 'slack', { dmPolicy: 'ALL' }); fresh();
    const all = await isResourceAllowed(WS, 'slack', dm);
    check('dmPolicy=ALL allows DMs', all.allowed);

    await updateSettings(WS, 'slack', { dmPolicy: 'SELECTED' }); fresh();
    const sel = await isResourceAllowed(WS, 'slack', dm);
    check('dmPolicy=SELECTED blocks a DM that was not opted in', !sel.allowed);

    await upsertDiscovered(WS, 'slack', [{ resourceType: 'dm', resourceId: 'D_PRIVATE', resourceName: 'DM' }]);
    await setAllowed(WS, 'slack', [{ resourceType: 'dm', resourceId: 'D_PRIVATE', allowed: true }]);
    fresh();
    const selOn = await isResourceAllowed(WS, 'slack', dm);
    check('dmPolicy=SELECTED allows an explicitly opted-in DM', selOn.allowed);

    await updateSettings(WS, 'slack', { dmPolicy: 'NEVER' }); fresh();
  }

  // ── 8. Every connector attributes its real item shape ───────────────────────
  console.log('\n8. Per-connector attribution (real adapter item shapes)');
  {
    await upsertDiscovered(WS, 'github',          [{ resourceType: 'repository', resourceId: 'acme/api',  resourceName: 'acme/api' }]);
    await upsertDiscovered(WS, 'gmail',           [{ resourceType: 'label',      resourceId: 'Label_Eng', resourceName: 'Engineering' }]);
    await upsertDiscovered(WS, 'jira',            [{ resourceType: 'project',    resourceId: 'FLOW',      resourceName: 'FLOW' }]);
    await upsertDiscovered(WS, 'google-calendar', [{ resourceType: 'calendar',   resourceId: 'work@x.com', resourceName: 'Work' }]);

    await setAllowed(WS, 'github',          [{ resourceType: 'repository', resourceId: 'acme/api',   allowed: true }]);
    await setAllowed(WS, 'gmail',           [{ resourceType: 'label',      resourceId: 'Label_Eng',  allowed: true }]);
    await setAllowed(WS, 'jira',            [{ resourceType: 'project',    resourceId: 'FLOW',       allowed: true }]);
    await setAllowed(WS, 'google-calendar', [{ resourceType: 'calendar',   resourceId: 'work@x.com', allowed: true }]);
    fresh();

    check('github PR in allowed repo passes',      (await isResourceAllowed(WS, 'github', ghPR('acme/api'))).allowed);
    check('github PR in other repo blocked',      !(await isResourceAllowed(WS, 'github', ghPR('acme/payroll'))).allowed);

    check('gmail msg with allowed label passes',   (await isResourceAllowed(WS, 'gmail', gmailMsg(['INBOX', 'Label_Eng']))).allowed);
    check('gmail msg without allowed label blocked', !(await isResourceAllowed(WS, 'gmail', gmailMsg(['INBOX', 'Label_Finance']))).allowed);

    check('jira issue in allowed project passes',  (await isResourceAllowed(WS, 'jira', jiraIssue('FLOW'))).allowed);
    check('jira issue in other project blocked',  !(await isResourceAllowed(WS, 'jira', jiraIssue('PAYROLL'))).allowed);

    check('calendar event on allowed calendar passes', (await isResourceAllowed(WS, 'google-calendar', calEvent('work@x.com'))).allowed);
    check('calendar event on personal calendar blocked', !(await isResourceAllowed(WS, 'google-calendar', calEvent('personal@x.com'))).allowed);
  }

  // ── 9. Webhook door (bypasses SyncEngine entirely) ──────────────────────────
  console.log('\n9. Webhook door');
  {
    fresh();
    const okWh = await isWebhookAllowed(WS, 'github', { repository: { full_name: 'acme/api' } });
    check('webhook for allowed repo passes', okWh.allowed);

    const badWh = await isWebhookAllowed(WS, 'github', { repository: { full_name: 'acme/payroll' } });
    check('webhook for hidden repo BLOCKED before persistence', !badWh.allowed);

    const slackWh = await isWebhookAllowed(WS, 'slack', { event: { channel: 'C_FIN' } });
    check('slack webhook from hidden channel BLOCKED', !slackWh.allowed);

    const junk = await isWebhookAllowed(WS, 'github', {});
    check('unattributable webhook BLOCKED', !junk.allowed);
  }

  // ── 10. Capability-route door ───────────────────────────────────────────────
  console.log('\n10. Capability sync routes (/api/*/sync door)');
  {
    fresh();
    check('/engineering/sync on allowed repo permitted',
      (await isResourceIdAllowed(WS, 'github', 'repository', 'acme/api')).allowed);
    check('/engineering/sync on hidden repo refused',
      !(await isResourceIdAllowed(WS, 'github', 'repository', 'acme/payroll')).allowed);
    check('/communication/sync any-of labels honoured',
      (await isResourceIdAllowed(WS, 'gmail', 'label', ['INBOX', 'Label_Eng'])).allowed);

    const ids = await getAllowedResourceIds(WS, 'google-calendar', 'calendar');
    check('calendar fan-out only over allowed calendars', ids.length === 1 && ids[0] === 'work@x.com', JSON.stringify(ids));
  }

  // ── 11. Legacy grandfathering (non-breaking deploy) ─────────────────────────
  console.log('\n11. Legacy grandfathering');
  {
    const LEG = `${WS}_legacy`;
    await updateSettings(LEG, 'slack', { legacyGrandfathered: true });
    clearCache();
    resetLegacyWarnings();

    const before = await isResourceAllowed(LEG, 'slack', slackMsg('C_ANYTHING'));
    check('pre-existing connector keeps ingesting until discovery runs', before.allowed && before.reason === GateReason.LEGACY, before.reason);

    // First discovery: preserve current access, then govern.
    await upsertDiscovered(LEG, 'slack', [
      { resourceType: 'channel', resourceId: 'C_OLD', resourceName: '#old' },
    ], { defaultAllowed: true });
    await updateSettings(LEG, 'slack', { legacyGrandfathered: false });
    clearCache();

    const kept = await isResourceAllowed(LEG, 'slack', slackMsg('C_OLD'));
    check('existing access preserved after first discovery', kept.allowed);

    const now = await isResourceAllowed(LEG, 'slack', slackMsg('C_ANYTHING'));
    check('governance ACTIVE after first discovery (unknown now denied)', !now.allowed);

    await prisma.integrationPermission.deleteMany({ where: { workspaceId: LEG } });
    await prisma.integrationPermissionSetting.deleteMany({ where: { workspaceId: LEG } });
  }

  // ── 12. Ungoverned connectors are untouched ─────────────────────────────────
  console.log('\n12. Connectors with no sync adapter');
  {
    fresh();
    const v = await isResourceAllowed(WS, 'hubspot', { metadata: {} });
    check('connector without a sync adapter is not gated', v.allowed && v.reason === GateReason.NOT_GOVERNED);
  }

  await cleanup();

  console.log(`\n${'─'.repeat(52)}`);
  console.log(`${fail === 0 ? '✅' : '❌'}  ${pass} passed / ${fail} failed`);
  console.log(`${'─'.repeat(52)}\n`);

  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\n💥 Validation crashed:', err);
  await cleanup().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
