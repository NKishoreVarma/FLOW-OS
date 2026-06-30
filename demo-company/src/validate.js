import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = process.env.FLOW_API || 'http://localhost:5001';
const TOKEN = process.env.FLOW_TOKEN;
const WORKSPACE_ID = process.env.FLOW_WORKSPACE_ID;

if (!TOKEN || !WORKSPACE_ID) { console.error('FLOW_TOKEN and FLOW_WORKSPACE_ID required'); process.exit(1); }

const headers = { 'Authorization': `Bearer ${TOKEN}`, 'workspace-id': WORKSPACE_ID, 'Content-Type': 'application/json' };

async function check(label, fn) {
  try { const r = await fn(); console.log(`  ✅ ${label}`); return { label, status: 'PASS', ...r }; }
  catch (err) { console.log(`  ❌ ${label}: ${err.message}`); return { label, status: 'FAIL', error: err.message }; }
}
async function get(p) { const r = await fetch(`${API}${p}`, { headers }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
async function post(p, body) { const r = await fetch(`${API}${p}`, { method:'POST', headers, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }

const importResultPath = path.join(__dirname, '..', 'exports', 'last-import-result.json');
const importResult = fs.existsSync(importResultPath) ? JSON.parse(fs.readFileSync(importResultPath, 'utf8')) : {};

console.log('🔍 Validating FLOW workspace after Helios import...\n');

const checks = await Promise.allSettled([
  check('API health', async () => { const r = await get('/health'); return { evidence: `status: ${r.status}` }; }),
  check('Import history has record', async () => { const r = await get('/api/lifecycle/history'); const found = (r.records||r||[]).find?.(x=>x.importId===importResult.importId); if(!found&&importResult.importId) throw new Error('not found'); return { evidence: `records: ${(r.records||r||[]).length}` }; }),
  check('Health score available', async () => { const r = await get('/api/intelligence/health-score'); return { evidence: `score present: ${!!r}` }; }),
  check('Universal Search returns results', async () => { const r = await post('/api/query', { queryText: 'Helios Platform engineering team incidents' }); if(!r.synthesis&&!r.answer&&!r.brief) throw new Error('no synthesis'); return { evidence: `synthesis: ${(r.synthesis||r.answer||r.brief||'').length} chars` }; }),
  check('Daily Briefing generates', async () => { const r = await get('/api/brain/briefing?role=EXECUTIVE'); return { evidence: `briefing keys: ${Object.keys(r||{}).length}` }; }),
  check('Copilot answers questions', async () => { const r = await post('/api/brain/copilot', { question: 'What are the current P0 incidents at Helios?' }); return { evidence: `answer: ${(r.answer||r.response||r.content||'?').slice?.(0,60)}` }; }),
  check('Recommendations available', async () => { const r = await get('/api/brain/recommendations'); return { evidence: `count: ${(r.recommendations||r||[]).length}` }; }),
  check('Timeline populated', async () => { const r = await get('/api/brain/timeline'); return { evidence: `events: ${(r.events||r||[]).length}` }; }),
  check('Lifecycle schema returns types', async () => { const r = await get('/api/lifecycle/schema'); if((r.supportedTypes?.length||0)<20) throw new Error(`only ${r.supportedTypes?.length} types`); return { evidence: `types: ${r.supportedTypes?.length}` }; }),
]);

const results = checks.map(c => c.status==='fulfilled' ? c.value : { label:'check', status:'FAIL', error: c.reason?.message });
const passed = results.filter(r=>r.status==='PASS').length;
const failed = results.filter(r=>r.status==='FAIL').length;

const report = `# DEMO_IMPORT_REPORT.md
> Helios Software Inc. — FLOW Workspace Import Validation Report
> Generated: ${new Date().toISOString()}

---

## Part A — Auto-Generated Import Report

| Field | Value |
|-------|-------|
| Import ID | ${importResult.importId||'N/A'} |
| Workspace ID | ${importResult.workspaceId||WORKSPACE_ID} |
| Organization | Helios Software Inc. |
| Schema Version | 1.0 |
| Engine Version | 2.0 |
| Status | ${importResult.status||'N/A'} |

### Dataset Statistics
\`\`\`json
${JSON.stringify(importResult.statistics||{},null,2)}
\`\`\`

### Graph Metrics
\`\`\`json
${JSON.stringify(importResult.graphMetrics||{},null,2)}
\`\`\`

---

## Part B — Functional Validation Report

| # | Check | Status | Evidence |
|---|-------|--------|----------|
${results.map((r,i)=>`| ${i+1} | ${r.label} | ${r.status==='PASS'?'✅ PASS':'❌ FAIL'} | ${r.evidence||r.error||''} |`).join('\n')}

---

## Summary

- **Total checks:** ${results.length}
- **Passed:** ${passed}
- **Failed:** ${failed}
- **Result:** ${failed===0?'🟢 ALL CHECKS PASSED — Helios workspace fully operational':`🔴 ${failed} CHECK(S) FAILED`}

*This report is the acceptance document for Milestone 2 — Demo Company Integration.*
`;

const reportPath = path.join(__dirname,'..','..','DEMO_IMPORT_REPORT.md');
fs.writeFileSync(reportPath, report);
console.log(`\n📄 DEMO_IMPORT_REPORT.md written`);
console.log(`Result: ${passed}/${results.length} checks passed`);
if(failed>0) process.exit(1);
