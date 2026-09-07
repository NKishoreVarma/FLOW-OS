/**
 * Simulation Workspace — internal admin UI for the What-If Simulation Engine.
 *
 * Same security posture as the other admin surfaces: 404 in production; GET /
 * serves the HTML shell (no token); /api/* requires an OWNER/ADMIN JWT and a
 * workspace-id header. Self-contained: a scenario builder, a risk gauge, impact
 * dimension bars, risk drivers, recommended actions, and A/B comparison.
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { simulate, compare, SCENARIO_TYPES } from '../simulation/index.js';

const router = express.Router();

router.use((req, res, next) => { if (process.env.NODE_ENV === 'production') return res.status(404).end(); next(); });
router.use((req, res, next) => {
  if (req.path === '/') return next();
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Bearer token required' });
  try {
    const d = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
    if (!['OWNER', 'ADMIN'].includes(d.role)) return res.status(403).json({ error: 'Owner or Admin role required' });
    if (!req.headers['workspace-id']) return res.status(400).json({ error: 'workspace-id header required' });
    req.workspaceId = req.headers['workspace-id'];
    next();
  } catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
});

const ok = (fn) => async (req, res) => { try { res.json(await fn(req)); } catch (e) { res.status(500).json({ error: e.message }); } };
router.get('/api/types', (req, res) => res.json(Object.entries(SCENARIO_TYPES).map(([id, d]) => ({ id, label: d.label, abstract: !!d.abstract }))));
router.post('/api/simulate', express.json(), ok(req => simulate(req.workspaceId, req.body || {}, { persist: false })));
router.post('/api/compare', express.json(), ok(req => compare(req.workspaceId, req.body.a, req.body.b)));

router.get('/', (req, res) => { res.setHeader('Content-Type', 'text/html'); res.send(HTML); });

const HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>FLOW · Simulation Workspace</title>
<style>
 :root{--bg:#0a0d14;--panel:#131824;--line:#232b3d;--txt:#cdd8ea;--dim:#7b88a1;--acc:#4f8cff;--crit:#ff5c6c;--warn:#ffb454;--ok:#3fd68a}
 *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:13px ui-monospace,Menlo,monospace}
 header{display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line);background:var(--panel);flex-wrap:wrap}
 header h1{font-size:14px;margin:0;color:#fff}
 input,select{background:#0a0d14;border:1px solid var(--line);color:var(--txt);padding:6px 8px;border-radius:6px;font:inherit}
 button{background:var(--acc);border:1px solid var(--acc);color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font:inherit}
 button.ghost{background:var(--panel);border-color:var(--line);color:var(--txt)}
 main{padding:16px;max-width:1100px;margin:0 auto;display:grid;grid-template-columns:320px 1fr;gap:16px}
 .panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px}
 .panel h3{margin:0 0 10px;font-size:11px;text-transform:uppercase;color:var(--dim)}
 label{display:block;margin:8px 0 3px;color:var(--dim);font-size:11px}
 .full{width:100%}
 .gauge{text-align:center;padding:8px}
 .gauge .score{font-size:44px;font-weight:700}
 .lv-critical{color:var(--crit)}.lv-high{color:var(--warn)}.lv-moderate{color:#e0c341}.lv-low{color:var(--ok)}
 .bars div{margin:6px 0}.bar{height:14px;border-radius:4px;background:var(--acc)}
 .row{display:flex;justify-content:space-between;font-size:12px;margin:3px 0}
 .act{padding:6px 8px;border-left:3px solid var(--acc);background:#0a0d14;border-radius:4px;margin:5px 0}
 .act.high{border-color:var(--crit)}
 .dim{color:var(--dim)}.tag{display:inline-block;padding:1px 7px;border-radius:20px;font-size:10px;background:#0a0d14}
 .cols{display:grid;grid-template-columns:1fr 1fr;gap:10px}
 pre{white-space:pre-wrap;color:#9fb3d0;font-size:11px}
</style></head><body>
<header>
 <h1>🔮 Simulation Workspace</h1>
 <input id="ws" placeholder="workspace-id" size="16"><input id="jwt" placeholder="ADMIN JWT" type="password" size="16"><button onclick="conn()">Connect</button>
 <span style="flex:1"></span>
 <label style="margin:0"><input type="checkbox" id="cmp"> compare mode</label>
</header>
<main>
 <div class="panel">
  <h3>Scenario</h3>
  <label>Type</label><select id="type" class="full"></select>
  <label>Target (name — employee, repo, customer…)</label><input id="target" class="full" placeholder="e.g. Alice / payments-svc / Acme">
  <div class="cols"><div><label>hours</label><input id="hours" class="full" value="6"></div><div><label>weeks</label><input id="weeks" class="full" value="2"></div></div>
  <div id="cmpBox" style="display:none;border-top:1px solid var(--line);margin-top:10px;padding-top:8px">
   <h3>Scenario B</h3>
   <label>Type</label><select id="typeB" class="full"></select>
   <label>Target</label><input id="targetB" class="full">
  </div>
  <button class="full" style="margin-top:12px" onclick="run()">Run simulation ▶</button>
  <div id="status" class="dim" style="margin-top:8px"></div>
 </div>
 <div id="out" class="panel"><div class="dim">Connect, build a scenario, and run it.</div></div>
</main>
<script>
const $=s=>document.querySelector(s);
function auth(){return{'Authorization':'Bearer '+localStorage.sw_jwt,'workspace-id':localStorage.sw_ws,'Content-Type':'application/json'};}
async function api(p,b){const r=await fetch('/simulation-workspace/api'+p,{method:b?'POST':'GET',headers:auth(),body:b?JSON.stringify(b):undefined});if(!r.ok)throw new Error((await r.json()).error||r.status);return r.json();}
function conn(){localStorage.sw_ws=$('#ws').value.trim();localStorage.sw_jwt=$('#jwt').value.trim();boot();}
function esc(s){return String(s??'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));}
$('#cmp').onchange=e=>$('#cmpBox').style.display=e.target.checked?'block':'none';
async function boot(){
 $('#ws').value=localStorage.sw_ws||'';$('#jwt').value=localStorage.sw_jwt||'';
 if(!localStorage.sw_jwt)return;
 try{const t=await api('/types');const opts=t.map(x=>'<option value="'+x.id+'">'+esc(x.label)+'</option>').join('');$('#type').innerHTML=opts;$('#typeB').innerHTML=opts;}catch(e){$('#out').innerHTML='<span class=lv-critical>'+esc(e.message)+'</span>';}
}
function scenario(t,tg){return{type:t,targetName:$(tg).value.trim()||undefined,params:{hours:+$('#hours').value,weeks:+$('#weeks').value,count:5}};}
async function run(){
 $('#status').textContent='running…';
 try{
  if($('#cmp').checked){
   const res=await api('/compare',{a:scenario('#type','#target'),b:scenario('#typeB','#targetB')});
   renderCompare(res);
  }else{
   const s=await api('/simulate',scenario('#type','#target'));
   render(s);
  }
  $('#status').textContent='';
 }catch(e){$('#status').textContent='';$('#out').innerHTML='<span class=lv-critical>'+esc(e.message)+'</span>';}
}
function gauge(score,level){return '<div class=gauge><div class="score lv-'+level+'">'+score+'</div><div class="tag lv-'+level+'">'+esc(level)+' risk</div></div>';}
function bars(s){const dims=[['Business',s.businessImpact],['Engineering',s.engineeringImpact],['Customer',s.customerImpact],['Operational',s.operationalImpact],['Knowledge loss',s.knowledgeLoss]];
 return '<div class=bars>'+dims.map(([l,d])=>'<div><div class=row><span>'+l+'</span><span class="dim">'+(d?.score??0)+'</span></div><div class=bar style="width:'+(d?.score??0)+'%;background:'+col(d?.score)+'"></div></div>').join('')+'</div>';}
function col(s){return s>=80?'#ff5c6c':s>=60?'#ffb454':s>=35?'#e0c341':'#3fd68a';}
function render(s){
 if(!s||s.ok===false){$('#out').innerHTML='<span class=lv-critical>'+esc(s?.error||'invalid scenario')+(s?.validation?': '+s.validation.errors.join('; '):'')+'</span>';return;}
 $('#out').innerHTML=
  '<div class=cols><div>'+gauge(s.overallRiskScore,s.riskLevel)+'</div><div><h3>Executive summary</h3><div>'+esc(s.executiveSummary)+'</div>'
  +'<div class=row style="margin-top:8px"><span class=dim>confidence</span><b>'+s.confidence+'/100</b></div>'
  +(s.financialEstimate?.estimate?'<div class=row><span class=dim>financial (heuristic)</span><b>$'+Number(s.financialEstimate.estimate).toLocaleString()+'</b></div>':'')+'</div></div>'
  +'<h3 style="margin-top:14px">Impact</h3>'+bars(s)
  +'<h3 style="margin-top:14px">Risk drivers</h3>'+(s.riskDrivers||[]).map(d=>'<span class=tag style="margin:2px">'+esc(d.driver)+' '+d.score+'</span>').join(' ')
  +'<h3 style="margin-top:14px">Recommended actions</h3>'+(s.recommendedActions||[]).map(a=>'<div class="act '+(a.priority==='high'?'high':'')+'"><b>'+esc(a.title)+'</b><div class=dim>'+esc(a.why)+'</div></div>').join('')
  +'<div class=cols style="margin-top:14px"><div><h3>Knowledge loss</h3><div class=dim>'+esc(s.knowledgeLoss?.note||'')+'</div></div>'
  +'<div><h3>Dependencies / timeline</h3><div class=dim>'+(s.dependenciesAffected?.count||0)+' affected · '+esc(s.timelineChanges?.note||'')+'</div></div></div>'
  +'<h3 style="margin-top:14px">Assumptions</h3><ul class=dim>'+(s.assumptions||[]).map(a=>'<li>'+esc(a)+'</li>').join('')+'</ul>';
}
function renderCompare(res){
 const a=res.a,b=res.b,d=res.delta;
 $('#out').innerHTML='<h3>Comparison</h3><div class=cols>'
  +'<div class=panel><b>A: '+esc(a.scenario?.label||'')+'</b>'+gauge(a.overallRiskScore,a.riskLevel)+bars(a)+'</div>'
  +'<div class=panel><b>B: '+esc(b.scenario?.label||'')+'</b>'+gauge(b.overallRiskScore,b.riskLevel)+bars(b)+'</div></div>'
  +'<div class=row style="margin-top:10px"><span class=dim>Δ risk</span><b>'+(d?.riskDelta>0?'+':'')+d?.riskDelta+' (higher: '+d?.higherRisk+')</b></div>'
  +(d?.financialDelta?'<div class=row><span class=dim>Δ financial</span><b>$'+Number(d.financialDelta).toLocaleString()+'</b></div>':'');
}
boot();
</script></body></html>`;

export default router;
