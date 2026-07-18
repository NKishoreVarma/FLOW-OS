/**
 * Replay Player — internal admin DVR UI for the Workspace Replay Engine.
 *
 * Same security posture as the Event Inspector / Graph Explorer: 404 in
 * production; GET / serves the HTML shell (no token); all /api/* routes require an
 * OWNER/ADMIN JWT and a workspace-id header. Self-contained (no build, no CDN):
 * a timeline scrubber with play/pause/step/jump-to-marker/speed and filters.
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { replay, snapshotCompare, MODES } from '../replay/index.js';

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
router.get('/api/modes', (req, res) => res.json(Object.keys(MODES)));
router.post('/api/replay', express.json({ limit: '1mb' }), ok(req => replay(req.workspaceId, req.body || {})));
router.post('/api/compare', express.json(), ok(req => snapshotCompare(req.workspaceId, req.body.t1, req.body.t2)));

router.get('/', (req, res) => { res.setHeader('Content-Type', 'text/html'); res.send(HTML); });

const HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>FLOW · Replay Player</title>
<style>
 :root{--bg:#0a0d14;--panel:#131824;--line:#232b3d;--txt:#cdd8ea;--dim:#7b88a1;--acc:#4f8cff;--crit:#ff5c6c;--warn:#ffb454;--ok:#3fd68a}
 *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:13px ui-monospace,Menlo,monospace}
 header{display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line);background:var(--panel);flex-wrap:wrap}
 header h1{font-size:14px;margin:0;color:#fff}
 input,select{background:#0a0d14;border:1px solid var(--line);color:var(--txt);padding:6px 8px;border-radius:6px;font:inherit}
 button{background:var(--panel);border:1px solid var(--line);color:var(--txt);padding:6px 10px;border-radius:6px;cursor:pointer;font:inherit}
 button:hover{border-color:var(--acc)}button.p{background:var(--acc);color:#fff;border-color:var(--acc)}
 main{padding:14px;max-width:1200px;margin:0 auto}
 .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:14px}
 .card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px}
 .card .n{font-size:20px;color:#fff}.card .l{color:var(--dim);font-size:10px;text-transform:uppercase}
 #track{position:relative;height:70px;background:var(--panel);border:1px solid var(--line);border-radius:8px;margin:10px 0;display:flex;align-items:flex-end;overflow:hidden}
 .bar{flex:1;margin:0 1px;background:var(--acc);opacity:.5;min-height:2px;cursor:pointer}
 .bar.on{opacity:1;background:#fff}
 .bar.mk{background:var(--crit);opacity:.85}
 #cursor{position:absolute;top:0;bottom:0;width:2px;background:var(--warn);pointer-events:none}
 .controls{display:flex;gap:6px;align-items:center;margin:8px 0}
 #frame{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px;min-height:120px}
 .ev{padding:4px 6px;border-bottom:1px solid var(--line)}
 .pill{padding:0 6px;border-radius:20px;font-size:10px}.crit{background:rgba(255,92,108,.15);color:var(--crit)}.high{background:rgba(255,180,84,.15);color:var(--warn)}
 .dim{color:var(--dim)} .when{color:var(--warn);font-size:12px}
</style></head><body>
<header>
 <h1>⏵ Replay Player</h1>
 <input id="ws" placeholder="workspace-id" size="16"><input id="jwt" placeholder="ADMIN JWT" type="password" size="16"><button onclick="conn()">Connect</button>
 <span style="flex:1"></span>
 <select id="mode"></select>
 <select id="range"><option value="7d">7d</option><option value="30d" selected>30d</option><option value="90d">90d</option></select>
 <input id="focus" placeholder="focus (customer/incident…)" size="16">
 <input id="connector" placeholder="connector" size="9">
 <button onclick="load()" class="p">Load</button>
</header>
<main>
 <div class="cards" id="stats"></div>
 <div id="track"><div id="cursor"></div></div>
 <div class="controls">
   <button onclick="step(-1)">⏮ Step</button>
   <button id="play" onclick="toggle()">▶ Play</button>
   <button onclick="step(1)">Step ⏭</button>
   <span class="dim">speed</span><select id="speed"><option>1</option><option>4</option><option selected>12</option><option>48</option></select>
   <span class="dim">jump</span><select id="marker" onchange="jump()"></select>
   <span style="flex:1"></span><span id="pos" class="when"></span>
 </div>
 <div id="frame"><div class="dim">Connect, choose a mode, and Load a replay.</div></div>
</main>
<script>
let R=null, idx=0, timer=null;
const $=s=>document.querySelector(s);
function auth(){return{'Authorization':'Bearer '+localStorage.rp_jwt,'workspace-id':localStorage.rp_ws,'Content-Type':'application/json'};}
async function api(p,b){const r=await fetch('/replay-player/api'+p,{method:b?'POST':'GET',headers:auth(),body:b?JSON.stringify(b):undefined});if(!r.ok)throw new Error((await r.json()).error||r.status);return r.json();}
function conn(){localStorage.rp_ws=$('#ws').value.trim();localStorage.rp_jwt=$('#jwt').value.trim();boot();}
function esc(s){return String(s??'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));}
async function boot(){
 $('#ws').value=localStorage.rp_ws||'';$('#jwt').value=localStorage.rp_jwt||'';
 if(!localStorage.rp_jwt)return;
 try{const modes=await api('/modes');$('#mode').innerHTML=modes.map(m=>'<option>'+m+'</option>').join('');}catch(e){$('#frame').innerHTML='<span class=crit>'+esc(e.message)+'</span>';}
}
async function load(){
 pause();
 const scope={range:$('#range').value,limit:4000};
 const f=$('#focus').value.trim(); if(f)scope.focus=f;
 const c=$('#connector').value.trim(); if(c)scope.connector=c;
 try{
   const res=await api('/replay',{mode:$('#mode').value,scope});
   R=res; idx=0; renderStats(); renderTrack(); renderMarkers(); show();
 }catch(e){$('#frame').innerHTML='<span class=crit>'+esc(e.message)+'</span>';}
}
function renderStats(){
 const m=R.metrics;
 $('#stats').innerHTML=[
   ['events',R.totalEvents],['days',R.timeline.frames.length],['peak/day',m.peakPeriod?.count||0],
   ['incidents',m.incident?.count||0],['MTTR',m.incident?.mttrHours!=null?m.incident.mttrHours+'h':'—'],['deploys',m.deployment?.count||0],
 ].map(([l,n])=>'<div class=card><div class=n>'+esc(n)+'</div><div class=l>'+l+'</div></div>').join('');
}
function renderTrack(){
 const fr=R.timeline.frames, max=Math.max(1,...fr.map(f=>f.count));
 const mkFrames=new Set((R.navigation.markers||[]).map(mk=>mk.frameIndex));
 $('#track').innerHTML='<div id="cursor"></div>'+fr.map((f,i)=>'<div class="bar'+(mkFrames.has(i)?' mk':'')+'" style="height:'+(f.count/max*100)+'%" title="'+esc(f.t)+': '+f.count+'" onclick="idx='+i+';show()"></div>').join('');
}
function renderMarkers(){
 $('#marker').innerHTML='<option value="">—</option>'+(R.navigation.markers||[]).slice(0,60).map(mk=>'<option value="'+mk.frameIndex+'">'+esc((mk.title||mk.eventType).slice(0,40))+'</option>').join('');
}
function show(){
 if(!R)return;
 idx=Math.max(0,Math.min(R.timeline.frames.length-1,idx));
 const f=R.timeline.frames[idx];
 const bars=document.querySelectorAll('.bar');bars.forEach((b,i)=>b.classList.toggle('on',i===idx));
 $('#cursor').style.left=(R.timeline.frames.length?(idx/(R.timeline.frames.length-1||1))*100:0)+'%';
 $('#pos').textContent=(f?f.t:'')+'  ['+(idx+1)+'/'+R.timeline.frames.length+']';
 $('#frame').innerHTML=f?f.events.slice(0,40).map(e=>'<div class=ev><span class="pill '+(e.priority==='critical'?'crit':e.priority==='high'?'high':'')+'">'+esc(e.eventType)+'</span> '+(e.actor?'<b>'+esc(e.actor)+'</b>: ':'')+esc(e.title||'')+' <span class=dim>'+esc((e.ts||'').slice(11,16))+'</span></div>').join(''):'<span class=dim>no frame</span>';
}
function step(d){pause();idx+=d;show();}
function jump(){const v=$('#marker').value;if(v!=='')  {idx=+v;show();}}
function toggle(){timer?pause():play();}
function play(){
 if(!R)return;
 $('#play').textContent='⏸ Pause';$('#play').classList.add('p');
 const spd=+$('#speed').value;
 timer=setInterval(()=>{ if(idx>=R.timeline.frames.length-1){pause();return;} idx++; show(); }, Math.max(120, 1200/spd));
}
function pause(){if(timer){clearInterval(timer);timer=null;}$('#play').textContent='▶ Play';$('#play').classList.remove('p');}
boot();
</script></body></html>`;

export default router;
