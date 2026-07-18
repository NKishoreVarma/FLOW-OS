/**
 * Event Inspector — internal admin page for the unified Event Platform.
 *
 * Mirrors the devDashboard security posture:
 *   - 404 in production (not discoverable, not accessible)
 *   - GET / serves the HTML shell (no token; JWT pasted in the UI)
 *   - all /api/* routes require a Bearer JWT with OWNER/ADMIN role AND a
 *     workspace-id header (tenant isolation — no cross-workspace events)
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import {
  liveEvents, eventDetail, failures, subscriberStats,
  processingStats, correlationGraph, overview,
} from '../events/EventInspector.js';
import { getMetrics } from '../events/index.js';

const router = express.Router();

// Block everything in production.
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).end();
  next();
});

// Auth: HTML shell is open; API requires OWNER/ADMIN JWT + workspace-id header.
router.use((req, res, next) => {
  if (req.path === '/') return next();
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Event Inspector API requires a Bearer token' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    if (!['OWNER', 'ADMIN'].includes(decoded.role)) {
      return res.status(403).json({ error: 'Owner or Admin role required' });
    }
    const workspaceId = req.headers['workspace-id'];
    if (!workspaceId && req.path !== '/api/metrics') {
      return res.status(400).json({ error: 'workspace-id header required' });
    }
    req.user = { id: decoded.userId, role: decoded.role, orgId: decoded.orgId };
    req.workspaceId = workspaceId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// ── JSON API ──────────────────────────────────────────────────────────────────
router.get('/api/overview',  async (req, res, next) => { try { res.json(await overview(req.workspaceId)); } catch (e) { next(e); } });
router.get('/api/metrics',   (req, res) => res.json(getMetrics()));
router.get('/api/live',      async (req, res, next) => {
  try {
    res.json(await liveEvents(req.workspaceId, {
      limit: parseInt(req.query.limit, 10) || 50, type: req.query.type, connector: req.query.connector,
    }));
  } catch (e) { next(e); }
});
router.get('/api/event/:eventId', async (req, res, next) => {
  try {
    const detail = await eventDetail(req.workspaceId, req.params.eventId);
    if (!detail) return res.status(404).json({ error: 'Event not found' });
    res.json(detail);
  } catch (e) { next(e); }
});
router.get('/api/failures',    async (req, res, next) => { try { res.json(await failures(req.workspaceId, { limit: parseInt(req.query.limit, 10) || 50 })); } catch (e) { next(e); } });
router.get('/api/subscribers', async (req, res, next) => { try { res.json(await subscriberStats(req.workspaceId)); } catch (e) { next(e); } });
router.get('/api/stats',       async (req, res, next) => { try { res.json(await processingStats(req.workspaceId, { hoursBack: parseInt(req.query.hours, 10) || 24 })); } catch (e) { next(e); } });
router.get('/api/graph/:correlationId', async (req, res, next) => { try { res.json(await correlationGraph(req.workspaceId, req.params.correlationId)); } catch (e) { next(e); } });

// ── HTML shell ──────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(INSPECTOR_HTML);
});

const INSPECTOR_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>FLOW · Event Inspector</title>
<style>
  :root{--bg:#0b0e14;--panel:#141925;--line:#232a3a;--txt:#c9d4e5;--dim:#7a8699;--acc:#4f8cff;--crit:#ff5c6c;--ok:#3fd68a;--warn:#ffb454}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:13px/1.5 ui-monospace,Menlo,monospace}
  header{padding:12px 18px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  header h1{font-size:15px;margin:0;color:#fff;font-weight:600}
  header .sp{flex:1}
  input{background:var(--panel);border:1px solid var(--line);color:var(--txt);padding:6px 8px;border-radius:6px;font:inherit}
  button{background:var(--acc);border:0;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font:inherit}
  button.ghost{background:var(--panel);border:1px solid var(--line);color:var(--txt)}
  nav{display:flex;gap:4px;padding:8px 18px;border-bottom:1px solid var(--line)}
  nav a{padding:6px 12px;border-radius:6px;color:var(--dim);cursor:pointer;text-decoration:none}
  nav a.on{background:var(--panel);color:#fff}
  main{padding:18px;max-width:1200px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px}
  .card .n{font-size:24px;color:#fff;font-weight:600}.card .l{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
  table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}
  th{color:var(--dim);font-weight:500;font-size:11px;text-transform:uppercase}
  .pill{padding:1px 7px;border-radius:20px;font-size:11px}
  .crit{background:rgba(255,92,108,.15);color:var(--crit)}.high{background:rgba(255,180,84,.15);color:var(--warn)}
  .ok{color:var(--ok)}.bad{color:var(--crit)}.dim{color:var(--dim)}
  pre{background:#0b0e14;border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto;max-height:340px;color:#9fb3d0}
  .row{cursor:pointer}.row:hover{background:#0f1420}
  .hint{color:var(--dim);padding:20px;text-align:center}
</style></head>
<body>
<header>
  <h1>⚡ Event Inspector</h1>
  <span class="dim">unified event platform</span><span class="sp"></span>
  <input id="ws" placeholder="workspace-id" size="22">
  <input id="jwt" placeholder="Bearer JWT" size="26" type="password">
  <button onclick="save()">Connect</button>
</header>
<nav>
  <a data-t="overview" class="on" onclick="tab('overview')">Overview</a>
  <a data-t="live" onclick="tab('live')">Live Events</a>
  <a data-t="subscribers" onclick="tab('subscribers')">Subscribers</a>
  <a data-t="failures" onclick="tab('failures')">Failures / DLQ</a>
  <a data-t="detail" onclick="tab('detail')">Event Detail</a>
</nav>
<main id="view"><div class="hint">Enter a workspace-id and JWT, then Connect.</div></main>
<script>
let T='overview';
const $=s=>document.querySelector(s);
function save(){localStorage.ei_ws=$('#ws').value.trim();localStorage.ei_jwt=$('#jwt').value.trim();render();}
function tab(t){T=t;document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('on',a.dataset.t===t));render();}
async function api(p){
  const r=await fetch('/event-inspector/api'+p,{headers:{'Authorization':'Bearer '+localStorage.ei_jwt,'workspace-id':localStorage.ei_ws}});
  if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||r.status);
  return r.json();
}
function esc(s){return String(s??'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));}
function pri(p){const c=p==='critical'?'crit':p==='high'?'high':'';return '<span class="pill '+c+'">'+esc(p)+'</span>';}
function time(t){return new Date(t).toLocaleTimeString();}
async function render(){
  $('#ws').value=localStorage.ei_ws||'';$('#jwt').value=localStorage.ei_jwt||'';
  if(!localStorage.ei_ws||!localStorage.ei_jwt){$('#view').innerHTML='<div class="hint">Enter a workspace-id and JWT, then Connect.</div>';return;}
  try{
    if(T==='overview')return over();
    if(T==='live')return live();
    if(T==='subscribers')return subs();
    if(T==='failures')return fails();
    if(T==='detail')return detail();
  }catch(e){$('#view').innerHTML='<div class="hint bad">'+esc(e.message)+'</div>';}
}
async function over(){
  const o=await api('/overview');const m=o.metrics;
  $('#view').innerHTML='<div class="cards">'+
    card(o.storedEvents,'stored events')+card(m.counters.published,'published')+card(m.counters.duplicates,'deduped')+
    card(m.counters.delivered,'delivered')+card(o.failedDeliveries,'failed')+card(o.deadLetterDeliveries,'dead-letter')+
    card(m.throughput.eventsPerSec,'events/sec')+card(m.latencyMs.p95+'ms','p95 latency')+'</div>'+
    '<h3>By type</h3>'+bars(m.byType)+'<h3>By connector</h3>'+bars(m.byConnector);
}
function card(n,l){return '<div class="card"><div class="n">'+esc(n)+'</div><div class="l">'+l+'</div></div>';}
function bars(obj){const e=Object.entries(obj||{});if(!e.length)return '<div class="dim">none</div>';const mx=Math.max(...e.map(x=>x[1]));
  return '<table>'+e.map(([k,v])=>'<tr><td>'+esc(k)+'</td><td style="width:60%"><div style="background:var(--acc);height:10px;border-radius:4px;width:'+(v/mx*100)+'%"></div></td><td>'+v+'</td></tr>').join('')+'</table>';}
async function live(){
  const rows=await api('/live?limit=80');
  $('#view').innerHTML='<table><tr><th>time</th><th>type</th><th>connector</th><th>priority</th><th>title</th><th>corr</th></tr>'+
    rows.map(e=>'<tr class="row" onclick="localStorage.ei_eid=\\''+e.eventId+'\\';tab(\\'detail\\')"><td class="dim">'+time(e.timestamp)+'</td><td>'+esc(e.eventType)+'</td><td>'+esc(e.connector)+'</td><td>'+pri(e.priority)+'</td><td>'+esc(e.title)+'</td><td class="dim">'+(e.correlationId?e.correlationId.slice(0,8):'')+'</td></tr>').join('')+'</table>';
}
async function subs(){
  const rows=await api('/subscribers');
  $('#view').innerHTML='<table><tr><th>subscriber</th><th>total</th><th>delivered</th><th>failed</th><th>dead-letter</th><th>avg ms</th><th>max ms</th></tr>'+
    rows.map(s=>'<tr><td>'+esc(s.subscriber)+'</td><td>'+s.total+'</td><td class="ok">'+s.delivered+'</td><td class="'+(s.failed?'bad':'dim')+'">'+s.failed+'</td><td class="'+(s.dead_letter?'bad':'dim')+'">'+s.dead_letter+'</td><td>'+(s.avg_latency_ms??'-')+'</td><td>'+(s.max_latency_ms??'-')+'</td></tr>').join('')+'</table>';
}
async function fails(){
  const rows=await api('/failures');
  if(!rows.length){$('#view').innerHTML='<div class="hint ok">No failures or dead-letters 🎉</div>';return;}
  $('#view').innerHTML='<table><tr><th>time</th><th>subscriber</th><th>status</th><th>attempts</th><th>event</th><th>error</th></tr>'+
    rows.map(f=>'<tr><td class="dim">'+time(f.created_at)+'</td><td>'+esc(f.subscriber)+'</td><td class="bad">'+esc(f.status)+'</td><td>'+f.attempts+'</td><td class="row" onclick="localStorage.ei_eid=\\''+f.event_id+'\\';tab(\\'detail\\')">'+esc(f.title||f.event_type)+'</td><td class="dim">'+esc(f.error_message||'')+'</td></tr>').join('')+'</table>';
}
async function detail(){
  const id=localStorage.ei_eid;
  if(!id){$('#view').innerHTML='<div class="hint">Click an event in Live / Failures to inspect it.</div>';return;}
  const d=await api('/event/'+id);const e=d.event;
  $('#view').innerHTML='<h3>'+esc(e.title)+' '+pri(e.priority)+'</h3>'+
    '<div class="dim">'+esc(e.eventType)+' · '+esc(e.connector)+' · '+esc(e.timestamp)+' · v'+esc(e.version)+'</div>'+
    '<div class="cards" style="margin-top:12px">'+card(e.importance,'importance')+card(e.confidence,'confidence')+card(e.correlationId?e.correlationId.slice(0,8):'—','correlation')+card(e.causationId?e.causationId.slice(0,8):'—','causation')+'</div>'+
    '<h3>Subscriber deliveries</h3><table><tr><th>subscriber</th><th>status</th><th>attempts</th><th>ms</th><th>error</th></tr>'+
    d.deliveries.map(x=>'<tr><td>'+esc(x.subscriber)+'</td><td class="'+(x.status==='delivered'?'ok':'bad')+'">'+esc(x.status)+'</td><td>'+x.attempts+'</td><td>'+(x.latency_ms??'-')+'</td><td class="dim">'+esc(x.error_message||'')+'</td></tr>').join('')+'</table>'+
    '<h3>Payload</h3><pre>'+esc(JSON.stringify(e.payload,null,2))+'</pre>'+
    '<h3>Metadata</h3><pre>'+esc(JSON.stringify(e.metadata,null,2))+'</pre>';
}
render();
</script>
</body></html>`;

export default router;
