/**
 * validate-live-panel.js — guards the live feed filter (demo-critical surface).
 *
 * Asserts the 6 plumbing event types are hard-blocked and that real integration
 * events (GitHub commit/PR, Gmail, Slack, calendar) still render. Pure-function
 * test over lib/liveEvents.js — no server, no browser.
 */
import { isIntegrationEvent } from '../flow-os-frontend/src/lib/liveEvents.js';

let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

// The exact noise types the pilot demo must never show.
const NOISE = ['connector_action', 'health_score_updated', 'action_executed',
  'cognitive_routing_complete', 'connection_ack', 'read_via_notion'];
for (const t of NOISE) {
  ok(`blocks noise: ${t}`, isIntegrationEvent({ type: t, payload: { source: 'notion', title: 'x' } }) === false);
}

// Real integration events must pass.
ok('passes GitHub commit', isIntegrationEvent({ type: 'engineering', payload: { source: 'github', text: 'fix: null guard', metadata: { sha: 'abc123' } } }) === true);
ok('passes GitHub PR',     isIntegrationEvent({ type: 'github_pr_updated', payload: { source: 'github', title: 'Add retry' } }) === true);
ok('passes Gmail',         isIntegrationEvent({ type: 'communication', payload: { source: 'gmail', title: 'Re: proposal' } }) === true);
ok('passes Slack',         isIntegrationEvent({ type: 'slack_message', payload: { source: 'slack', text: '#eng: deploy done' } }) === true);
ok('passes Calendar',      isIntegrationEvent({ type: 'meeting', payload: { source: 'google-calendar', title: 'Standup' } }) === true);

// Noise titles rejected even from a real source.
ok('rejects "read via notion" title from real source', isIntegrationEvent({ type: 'knowledge', payload: { source: 'notion', title: 'Read via Notion' } }) === false);
ok('rejects health score title', isIntegrationEvent({ type: 'x', payload: { source: 'github', title: 'Workspace health updated' } }) === false);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
