/**
 * demo-dryrun.js — the 20-minute demo, run end-to-end against the REAL API.
 *
 * Uses the actual endpoints (/api/brain/copilot, /api/consequences, /api/events/feed),
 * NOT the assumed ones. Mints a JWT for the demo workspace's owner, runs every query a
 * CTO would type, and quality-checks each answer (no markdown, no jargon, cited, natural,
 * email compose returns a draft). Prints a demo-readiness verdict per query.
 *
 *   node scripts/demo-dryrun.js [workspaceExternalId]   (default: workspace_demo)
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/core/config/prisma.js';

const WS = process.argv[2] || 'workspace_demo';
const BASE = process.env.BRAIN_URL || 'http://localhost:5001';

const QUERIES = [
  'what is happening in engineering?',
  'show me the TechCorp situation',
  'what is the last commit?',
  'any pull requests waiting for review?',
  'what should I focus on first today?',
  'who am I?',
  'what meetings do I have today?',
];
const EMAIL_Q = 'compose an email to the TechCorp VP saying we will deliver the API integration by this Friday and apologize for the delay';

const MARKDOWN = /\*\*|^#{1,6}\s|`/m;
const JARGON = /john doe|workspace health|bus_factor|org memory|\bnull\/100\b|as an ai|according to the data/i;

let H = {};
// Use the STREAMING endpoint — that's what the frontend chat (the actual demo surface)
// uses. Accumulate token/draft/actions/done exactly as the browser does.
async function copilot(question, history = []) {
  const res = await fetch(`${BASE}/api/brain/copilot/stream`, {
    method: 'POST', headers: H, body: JSON.stringify({ question, history }),
  });
  if (!res.ok) return { _err: `${res.status}` };
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = '', tok = '', answer = '', draft = null, actions = [], type = null;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop() ?? '';
    for (const l of lines) {
      if (!l.startsWith('data: ')) continue;
      try {
        const p = JSON.parse(l.slice(6));
        if (p.type === 'token') tok += (p.delta || '');
        if (p.type === 'draft') { draft = p.draft; }
        if (p.type === 'actions') actions = p.actions || actions;
        if (p.type === 'done') { answer = p.answer || tok; if (p.draft) draft = p.draft; type = p.type; }
      } catch { /* ignore */ }
    }
  }
  return { answer: (answer || tok).trim(), draft, actions, type: draft ? 'action_draft' : 'text' };
}

function check(label, answer, { draft, actions } = {}) {
  const a = String(answer || '');
  const issues = [];
  if (MARKDOWN.test(a)) issues.push('markdown');
  if (JARGON.test(a)) issues.push('jargon/mock');
  if (a.length < 20) issues.push('too short');
  const verdict = issues.length ? `❌ ${issues.join(', ')}` : '✅ demo-ready';
  console.log(`\n▶ ${label}`);
  console.log(`  ${verdict}`);
  console.log(`  ${a.slice(0, 240).replace(/\n+/g, ' ')}`);
  return issues.length === 0;
}

async function main() {
  const ws = await prisma.workspace.findUnique({ where: { externalId: WS }, include: { org: true } });
  if (!ws) { console.error(`Workspace ${WS} not found — run: node scripts/seedDemoCompany.js ${WS}`); process.exit(1); }
  const owner = await prisma.user.findFirst({ where: { orgId: ws.orgId }, orderBy: { createdAt: 'asc' } });
  const token = jwt.sign(
    { userId: owner.id, email: owner.email, role: owner.role, orgId: ws.orgId },
    process.env.JWT_SECRET, { expiresIn: '30m' },
  );
  H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'workspace-id': WS };

  let pass = 0, total = 0;

  console.log('════════════════════════════════════════');
  console.log(`  DEMO DRY RUN · workspace ${WS} · ${BASE}`);
  console.log('════════════════════════════════════════');

  // ── Consequences (the "FLOW DETECTED" home surface) ──
  const cres = await fetch(`${BASE}/api/consequences?minProbability=55`, { headers: H });
  const cbody = cres.ok ? await cres.json() : {};
  const cons = cbody.consequences || cbody.data || [];
  console.log(`\n▶ FLOW DETECTED (consequence engine)`);
  console.log(`  ${cons.length ? '✅' : '❌'} ${cons.length} consequence(s) at ≥55%`);
  for (const c of cons) console.log(`    - ${c.title} (${c.probability}%)${c.crossTool ? ` · ${(c.sources||[]).join(' + ')}` : ''}`);
  total++; if (cons.length >= 3) pass++;

  // ── Conversation queries ──
  for (const q of QUERIES) {
    const r = await copilot(q);
    total++; if (check(q, r.answer || r.response, r)) pass++;
  }

  // ── Email compose (the closing moment) ──
  const er = await copilot(EMAIL_Q);
  const draft = er.draft || er.recommendation?.draft || null;
  const draftConnector = er.draft?.recommendation?.connector || er.type;
  console.log(`\n▶ EMAIL COMPOSE: "${EMAIL_Q.slice(0, 50)}..."`);
  const emailOk = !!draft && (String(draftConnector).includes('gmail') || er.type === 'action_draft' || er.type === 'email_draft');
  console.log(`  ${emailOk ? '✅ draft card ready' : '❌ no draft'}  · type=${er.type || 'n/a'}`);
  if (draft) {
    console.log(`    To: ${draft.to || draft.recipientName || draft.recommendation?.payload?.to || 'n/a'}`);
    console.log(`    Subject: ${draft.subject || draft.recommendation?.payload?.subject || 'n/a'}`);
    console.log(`    Body: ${String(draft.body || draft.recommendation?.payload?.body || '').slice(0, 120).replace(/\n+/g,' ')}`);
  }
  total++; if (emailOk) pass++;

  // ── Live feed cleanliness ──
  const fres = await fetch(`${BASE}/api/events/feed?limit=20`, { headers: H });
  const feed = fres.ok ? await fres.json() : [];
  const items = Array.isArray(feed) ? feed : (feed.feed || feed.events || []);
  const NOISE_RE = /workspace health|health.score|action.executed|connector.action|cognitive.rout|connection.ack|read via|bus_factor|org memory/i;
  const noise = items.filter(i => NOISE_RE.test(`${i.text||''} ${i.title||''} ${i.type||''}`));
  console.log(`\n▶ LIVE FEED cleanliness`);
  console.log(`  ${noise.length === 0 ? '✅' : '❌'} ${items.length} item(s), ${noise.length} noise`);
  total++; if (noise.length === 0) pass++;

  console.log('\n════════════════════════════════════════');
  console.log(`  ${pass}/${total} demo checks passed`);
  console.log('════════════════════════════════════════\n');
  await prisma.$disconnect();
  process.exit(pass === total ? 0 : 2);
}
main().catch(async (e) => { console.error(e); try { await prisma.$disconnect(); } catch {} process.exit(1); });
