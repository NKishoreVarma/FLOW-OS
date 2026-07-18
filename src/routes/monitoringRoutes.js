/**
 * Monitoring Dashboard — the production ops view for FLOW OS.
 *
 * 404 in production for the HTML shell (dev tool); it consumes the real
 * `/api/metrics` + `/api/metrics/alerts` endpoints (which ARE available in
 * production for monitoring systems) using an ADMIN JWT pasted in the UI. Shows
 * overall health, process/CPU/memory, DB pool, Redis, queues, event platform,
 * engines, connectors, WebSockets, and active alerts.
 */

import express from 'express';

const router = express.Router();

router.use((req, res, next) => { if (process.env.NODE_ENV === 'production') return res.status(404).end(); next(); });
router.get('/', (req, res) => { res.setHeader('Content-Type', 'text/html'); res.send(HTML); });

const HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>FLOW · Monitoring</title>
<style>
 :root{--bg:#0a0d14;--panel:#131824;--line:#232b3d;--txt:#cdd8ea;--dim:#7b88a1;--acc:#4f8cff;--crit:#ff5c6c;--warn:#ffb454;--ok:#3fd68a}
 *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:13px ui-monospace,Menlo,monospace}
 header{display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line);background:var(--panel);flex-wrap:wrap}
 header h1{font-size:14px;margin:0;color:#fff}
 input{background:#0a0d14;border:1px solid var(--line);color:var(--txt);padding:6px 8px;border-radius:6px;font:inherit}
 button{background:var(--acc);border:0;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font:inherit}
 main{padding:14px;max-width:1240px;margin:0 auto}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
 .card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px}
 .card h3{margin:0 0 8px;font-size:11px;text-transform:uppercase;color:var(--dim)}
 .row{display:flex;justify-content:space-between;font-size:12px;margin:3px 0}
 .k{color:var(--dim)} .ok{color:var(--ok)}.warn{color:var(--warn)}.crit{color:var(--crit)}
 .pill{padding:1px 8px;border-radius:20px;font-size:11px}
 .bar{height:8px;border-radius:4px;background:var(--acc);margin-top:2px}
 .alert{padding:6px 8px;border-radius:6px;margin:4px 0;border-left:3px solid var(--warn)}
 .alert.critical{border-color:var(--crit)}.alert.info{border-color:var(--acc)}
 #banner{padding:10px 14px;border-radius:8px;margin-bottom:12px;font-weight:700}
</style></head><body>
<header>
 <h1>📟 Monitoring</h1>
 <input id="jwt" placeholder="ADMIN JWT" type="password" size="24"><button onclick="save()">Connect</button>
 <label class="k"><input type="checkbox" id="auto" checked> auto-refresh 5s</label>
 <span style="flex:1"></span><span id="ts" class="k"></span>
</header>
<main><div id="banner">—</div><div id="out"><div class="k">Paste an ADMIN JWT and Connect.</div></div></main>
<script>
let timer=null;
const $=s=>document.querySelector(s);
function save(){localStorage.mon_jwt=$('#jwt').value.trim();loop();}
function esc(s){return String(s??'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));}
async function api(p){const r=await fetch(p,{headers:{'Authorization':'Bearer '+localStorage.mon_jwt}});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||r.status);return r.json();}
function mb(n){return (n/1048576).toFixed(0)+'MB';}
function card(title,rows){return '<div class=card><h3>'+title+'</h3>'+rows.map(([k,v,c])=>'<div class=row><span class=k>'+k+'</span><span class="'+(c||'')+'">'+v+'</span></div>').join('')+'</div>';}
async function render(){
 if(!localStorage.mon_jwt){return;}
 try{
  const [m,a]=await Promise.all([api('/api/metrics'),api('/api/metrics/alerts')]);
  $('#ts').textContent=new Date(m.timestamp).toLocaleTimeString();
  const statusCol=a.status==='critical'?'crit':a.status==='degraded'?'warn':'ok';
  $('#banner').innerHTML='System '+a.status.toUpperCase()+' · '+a.count+' alert(s)';
  $('#banner').style.background=a.status==='critical'?'rgba(255,92,108,.15)':a.status==='degraded'?'rgba(255,180,84,.15)':'rgba(63,214,138,.12)';
  $('#banner').className=statusCol;
  const q=Object.entries(m.queues||{}).map(([n,c])=>[n,(c.active||0)+'a / '+(c.waiting||0)+'w / '+(c.failed||0)+'f',(c.failed>0?'crit':'')]);
  const eng=Object.entries(m.engines||{}).map(([n,e])=>[n,e.runs+' runs · '+e.avgMs+'ms avg']);
  const ev=m.eventPlatform;
  const cards=[
   card('Process',[['uptime',Math.round(m.uptimeSec/60)+'m'],['cpu',m.process.cpuPercent+'%',m.process.cpuPercent>80?'warn':''],['heap',mb(m.process.memory.heapUsed)+' / '+mb(m.process.memory.heapTotal),m.process.heapUsedPct>85?'warn':''],['rss',mb(m.process.memory.rss)],['node',m.process.node]]),
   card('Database pool',[['status',m.db?'up':'—',m.db?'ok':'crit'],['in use',(m.db?.total||0)+' / '+(m.db?.max||0)],['idle',m.db?.idle||0],['waiting',m.db?.waiting||0,m.db?.waiting>10?'warn':''],['queries',m.db?.queries||0],['slow',m.db?.slowQueries||0,m.db?.slowQueries>0?'warn':'']]),
   card('Redis',[['status',m.redis?.status,m.redis?.status==='ready'?'ok':'crit'],['reconnects',m.redis?.reconnects||0,m.redis?.reconnects>0?'warn':'']]),
   card('Queues (a/w/f)',q.length?q:[['—','no queues']]),
   card('Event platform',ev?[['events/sec',ev.throughput?.eventsPerSec??0],['p95 latency',(ev.latencyMs?.p95??0)+'ms'],['published',ev.counters?.published??0],['duplicates',ev.counters?.duplicates??0],['dead-letter',ev.counters?.deadLettered??0,ev.counters?.deadLettered>0?'warn':'']]:[['—','unavailable']]),
   card('Engines',eng.length?eng:[['—','no runs yet']]),
   card('WebSockets',[['connections',m.websocket?.totalConnections??m.websocket?.connections??0],['workspaces',m.websocket?.workspaces??Object.keys(m.websocket?.byWorkspace||{}).length]]),
   card('Connectors',Object.keys(m.connectors||{}).length?Object.entries(m.connectors).slice(0,6).map(([ws,c])=>[ws.slice(0,14),(c.executed||0)+' ok / '+(c.denied||0)+' denied']):[['—','no activity']]),
  ];
  $('#out').innerHTML='<div class=grid>'+cards.join('')+'</div>'
   +'<h3 style="color:var(--dim);margin-top:16px">Active alerts</h3>'
   +(a.alerts.length?a.alerts.map(al=>'<div class="alert '+al.severity+'"><b>'+al.severity.toUpperCase()+'</b> ['+esc(al.rule)+'] '+esc(al.message)+'</div>').join(''):'<div class=ok>No active alerts ✓</div>');
 }catch(e){$('#out').innerHTML='<div class=crit>'+esc(e.message)+'</div>';}
}
function loop(){$('#jwt').value=localStorage.mon_jwt||'';render();if(timer)clearInterval(timer);if($('#auto').checked)timer=setInterval(render,5000);}
loop();
</script></body></html>`;

export default router;
