/**
 * Prediction Workspace — internal admin UI for Predictive Workspace Intelligence.
 *
 * Same posture as the other admin surfaces: 404 in production; GET / serves the
 * HTML shell; /api/* requires OWNER/ADMIN JWT + workspace-id. Self-contained:
 * domain filter, forecast cards (risk gauge, probability, trend, confidence,
 * preventive actions, evidence), a risk timeline, and prediction history.
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { predict, getHistory, DOMAINS } from '../predictions/index.js';

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
router.get('/api/domains', (req, res) => res.json(DOMAINS));
router.get('/api/predict', ok(req => predict(req.workspaceId, { domain: req.query.domain || undefined, persist: true })));
router.get('/api/history', ok(req => getHistory(req.workspaceId, 15)));

router.get('/', (req, res) => { res.setHeader('Content-Type', 'text/html'); res.send(HTML); });

const HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>FLOW · Prediction Workspace</title>
<style>
 :root{--bg:#0a0d14;--panel:#131824;--line:#232b3d;--txt:#cdd8ea;--dim:#7b88a1;--acc:#4f8cff;--crit:#ff5c6c;--high:#ffb454;--mod:#e0c341;--low:#3fd68a}
 *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:13px ui-monospace,Menlo,monospace}
 header{display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line);background:var(--panel);flex-wrap:wrap}
 header h1{font-size:14px;margin:0;color:#fff}
 input,select{background:#0a0d14;border:1px solid var(--line);color:var(--txt);padding:6px 8px;border-radius:6px;font:inherit}
 button{background:var(--acc);border:0;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font:inherit}
 button.ghost{background:var(--panel);border:1px solid var(--line);color:var(--txt)}
 main{padding:16px;max-width:1200px;margin:0 auto}
 .tl{display:flex;height:26px;border-radius:6px;overflow:hidden;border:1px solid var(--line);margin-bottom:16px}
 .tl div{display:flex;align-items:center;justify-content:center;font-size:10px;color:#0a0d14;font-weight:700}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
 .card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px;border-left:4px solid var(--line)}
 .card.critical{border-left-color:var(--crit)}.card.high{border-left-color:var(--high)}.card.moderate{border-left-color:var(--mod)}.card.low{border-left-color:var(--low)}
 .card h4{margin:0 0 2px;font-size:13px;color:#fff}
 .prob{font-size:26px;font-weight:700}.c-critical{color:var(--crit)}.c-high{color:var(--high)}.c-moderate{color:var(--mod)}.c-low{color:var(--low)}
 .meta{display:flex;justify-content:space-between;font-size:11px;color:var(--dim);margin:6px 0}
 .ev{font-size:11px;color:#9fb3d0;margin:3px 0}
 .act{font-size:11px;padding:4px 6px;background:#0a0d14;border-radius:4px;margin:3px 0}
 .tag{display:inline-block;padding:1px 6px;border-radius:20px;font-size:10px;background:#0a0d14}
 .up{color:var(--crit)}.down{color:var(--low)}.dim{color:var(--dim)}
 h3{font-size:11px;text-transform:uppercase;color:var(--dim);margin:16px 0 8px}
</style></head><body>
<header>
 <h1>📈 Prediction Workspace</h1>
 <input id="ws" placeholder="workspace-id" size="16"><input id="jwt" placeholder="ADMIN JWT" type="password" size="16"><button onclick="conn()">Connect</button>
 <span style="flex:1"></span>
 <select id="domain"><option value="">all domains</option></select>
 <button onclick="run()">Predict ▶</button>
 <button class="ghost" onclick="hist()">History</button>
</header>
<main><div id="out"><div class="dim">Connect and run predictions.</div></div></main>
<script>
const $=s=>document.querySelector(s);
function auth(){return{'Authorization':'Bearer '+localStorage.pw_jwt,'workspace-id':localStorage.pw_ws};}
async function api(p){const r=await fetch('/prediction-workspace/api'+p,{headers:auth()});if(!r.ok)throw new Error((await r.json()).error||r.status);return r.json();}
function conn(){localStorage.pw_ws=$('#ws').value.trim();localStorage.pw_jwt=$('#jwt').value.trim();boot();}
function esc(s){return String(s??'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));}
async function boot(){$('#ws').value=localStorage.pw_ws||'';$('#jwt').value=localStorage.pw_jwt||'';if(!localStorage.pw_jwt)return;
 try{const d=await api('/domains');$('#domain').innerHTML='<option value="">all domains</option>'+d.map(x=>'<option>'+x+'</option>').join('');}catch(e){$('#out').innerHTML='<span class=up>'+esc(e.message)+'</span>';}}
function col(l){return l;}
async function run(){
 $('#out').innerHTML='<div class=dim>running…</div>';
 try{
  const r=await api('/predict'+($('#domain').value?'?domain='+$('#domain').value:''));
  const preds=r.predictions.filter(p=>!p.insufficient);
  const ins=r.predictions.filter(p=>p.insufficient);
  const tl=preds.slice().sort((a,b)=>b.riskScore-a.riskScore).slice(0,12);
  $('#out').innerHTML=
   '<div class=meta><span>'+r.total+' predictions · '+r.elapsedMs+'ms · window '+r.windowDays+'d</span><span>'+Object.entries(r.byDomain).map(([k,v])=>k+':'+v).join('  ')+'</span></div>'
   +'<h3>Risk timeline (highest first)</h3><div class=tl>'+tl.map(p=>'<div style="flex:'+Math.max(1,p.riskScore)+';background:var(--'+p.riskLevel+')" title="'+esc(p.label)+' '+p.riskScore+'">'+p.riskScore+'</div>').join('')+'</div>'
   +'<h3>Forecast cards</h3><div class=grid>'+preds.sort((a,b)=>b.riskScore-a.riskScore).map(card).join('')+'</div>'
   +(ins.length?'<h3>Monitoring (insufficient signal)</h3><div class=grid>'+ins.map(p=>'<div class="card"><h4>'+esc(p.label)+'</h4><div class=dim>'+esc(p.prediction)+'</div></div>').join('')+'</div>':'');
 }catch(e){$('#out').innerHTML='<span class=up>'+esc(e.message)+'</span>';}
}
function card(p){
 const tr=p.trend&&p.trend.direction!=='stable'?'<span class="'+(p.trend.direction==='rising'?'up':'down')+'">'+(p.trend.direction==='rising'?'▲':'▼')+' '+p.trend.changePct+'%</span>':'<span class=dim>— stable</span>';
 return '<div class="card '+p.riskLevel+'"><h4>'+esc(p.label)+(p.target?.name?' · '+esc(p.target.name):'')+'</h4>'
  +'<div class="prob c-'+p.riskLevel+'">'+p.probability+'%</div>'
  +'<div class=meta><span>'+esc(p.timeHorizon)+'</span><span>conf '+p.confidence.score+'</span>'+tr+'</div>'
  +(p.supportingEvidence||[]).slice(0,2).map(e=>'<div class=ev>• '+esc(e)+'</div>').join('')
  +'<div style="margin-top:6px">'+(p.preventiveActions||[]).slice(0,2).map(a=>'<div class=act>✓ '+esc(a.title)+'</div>').join('')+'</div>'
  +(p.businessImpact?.financial?'<div class=meta><span class=dim>est. impact</span><b>$'+Number(p.businessImpact.financial).toLocaleString()+'</b></div>':'')+'</div>';
}
async function hist(){
 $('#out').innerHTML='<div class=dim>loading…</div>';
 try{const h=await api('/history');
  $('#out').innerHTML='<h3>Prediction history</h3>'+(h.length?h.map(r=>'<div class=card><div class=meta><span>'+esc((r.at||'').slice(0,16).replace("T"," "))+'</span><span>'+(r.topRisks||[]).length+' elevated</span></div><b>'+esc(r.title)+'</b><div style="margin-top:4px">'+(r.topRisks||[]).slice(0,5).map(t=>'<span class=tag style="margin:2px">'+esc(t.type)+' '+t.riskScore+'</span>').join('')+'</div></div>').join(''):'<div class=dim>No history yet.</div>');
 }catch(e){$('#out').innerHTML='<span class=up>'+esc(e.message)+'</span>';}
}
boot();
</script></body></html>`;

export default router;
