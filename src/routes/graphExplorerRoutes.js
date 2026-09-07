/**
 * Graph Explorer — internal admin visualization for the Operational Graph.
 *
 * Same security posture as the Event Inspector: 404 in production; GET / serves
 * the HTML shell (no token); all /api/* routes require an OWNER/ADMIN JWT and a
 * workspace-id header (tenant isolation). Self-contained force-directed SVG UI —
 * no build step, no external CDN.
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import {
  metrics, searchNodes, getNode, neighbors,
  analyzeImpact, analyzeDependencies, shortestPath, topConnected,
} from '../graph/index.js';

const router = express.Router();

router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).end();
  next();
});

router.use((req, res, next) => {
  if (req.path === '/') return next();
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Bearer token required' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    if (!['OWNER', 'ADMIN'].includes(decoded.role)) return res.status(403).json({ error: 'Owner or Admin role required' });
    const workspaceId = req.headers['workspace-id'];
    if (!workspaceId) return res.status(400).json({ error: 'workspace-id header required' });
    req.workspaceId = workspaceId;
    next();
  } catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
});

const ok = (fn) => async (req, res) => { try { res.json(await fn(req)); } catch (e) { res.status(500).json({ error: e.message }); } };

router.get('/api/metrics', ok(req => metrics(req.workspaceId)));
router.get('/api/hubs',    ok(req => topConnected(req.workspaceId, 15)));
router.get('/api/search',  ok(req => searchNodes(req.workspaceId, { text: req.query.q, type: req.query.type, limit: 25 })));
router.get('/api/node/:id', ok(async req => ({
  node: await getNode(req.workspaceId, req.params.id),
  neighbors: await neighbors(req.workspaceId, req.params.id),
})));
router.get('/api/impact/:id',       ok(req => analyzeImpact(req.workspaceId, req.params.id, 3)));
router.get('/api/dependencies/:id', ok(req => analyzeDependencies(req.workspaceId, req.params.id, 3)));
router.get('/api/path', ok(async req => {
  const path = await shortestPath(req.workspaceId, req.query.from, req.query.to, 5);
  return { path, found: !!path };
}));

router.get('/', (req, res) => { res.setHeader('Content-Type', 'text/html'); res.send(HTML); });

const HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>FLOW · Graph Explorer</title>
<style>
 :root{--bg:#0a0d14;--panel:#131824;--line:#232b3d;--txt:#cdd8ea;--dim:#7b88a1;--acc:#4f8cff}
 *{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--bg);color:var(--txt);font:13px ui-monospace,Menlo,monospace;overflow:hidden}
 #top{position:fixed;top:0;left:0;right:0;height:52px;display:flex;gap:8px;align-items:center;padding:0 14px;border-bottom:1px solid var(--line);background:var(--panel);z-index:5}
 #top h1{font-size:14px;margin:0;color:#fff}
 input,select{background:#0a0d14;border:1px solid var(--line);color:var(--txt);padding:6px 8px;border-radius:6px;font:inherit}
 button{background:var(--panel);border:1px solid var(--line);color:var(--txt);padding:6px 10px;border-radius:6px;cursor:pointer;font:inherit}
 button:hover{border-color:var(--acc)}button.on{background:var(--acc);color:#fff;border-color:var(--acc)}
 #side{position:fixed;top:52px;left:0;bottom:0;width:250px;border-right:1px solid var(--line);background:var(--panel);padding:12px;overflow:auto;z-index:4}
 #side h3{font-size:11px;text-transform:uppercase;color:var(--dim);margin:14px 0 6px}
 .res{padding:5px 7px;border-radius:5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .res:hover{background:#0a0d14}
 .k{font-size:11px;color:var(--dim)}
 svg{position:fixed;top:52px;left:250px;right:0;bottom:0}
 .lbl{font-size:9px;fill:var(--dim);pointer-events:none}
 .nlbl{font-size:10px;fill:#dfe8f5;pointer-events:none}
 #hint{position:fixed;bottom:10px;left:262px;color:var(--dim);font-size:11px}
 #stat{margin-top:8px;font-size:11px;line-height:1.7}
 .chip{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:middle}
</style></head><body>
<div id="top">
 <h1>🕸 Graph Explorer</h1>
 <input id="ws" placeholder="workspace-id" size="18">
 <input id="jwt" placeholder="ADMIN JWT" type="password" size="18">
 <button onclick="connect()">Connect</button>
 <span style="flex:1"></span>
 <button id="mImpact" onclick="mode('impact')">Impact</button>
 <button id="mDep" onclick="mode('dep')">Dependencies</button>
 <button id="mPath" onclick="mode('path')">Path</button>
 <button onclick="clearFx()">Reset</button>
 <label class="k">temporal ≤<input id="days" type="number" value="0" size="4" style="width:64px" oninput="applyTemporal()"> d ago (0=all)</label>
</div>
<div id="side">
 <input id="q" placeholder="search nodes…" style="width:100%" oninput="doSearch()">
 <div id="results"></div>
 <h3>Metrics</h3><div id="stat" class="k">—</div>
 <h3>Legend</h3><div id="legend" class="k"></div>
</div>
<svg id="svg"></svg>
<div id="hint">Connect → click a hub to expand · click nodes in a mode to run it</div>
<script>
const SVGNS='http://www.w3.org/2000/svg';
const COLORS={EMPLOYEE:'#4f8cff',DEPARTMENT:'#8a7dff',REPOSITORY:'#3fd68a',PULL_REQUEST:'#2fb3c9',COMMIT:'#2a8f6f',ISSUE:'#ffb454',MEETING:'#c98cff',DECISION:'#e0c341',PROJECT:'#ff8f5c',CUSTOMER:'#ff5c8a',VENDOR:'#c96',DOCUMENT:'#9aa7bd',EMAIL:'#7b88a1',SLACK_THREAD:'#66c',INCIDENT:'#ff5c6c',DEPLOYMENT:'#3fd68a',TASK:'#ffb454',RECOMMENDATION:'#4f8cff',MEMORY:'#8a7dff',TIMELINE_EVENT:'#556',INTEGRATION:'#456'};
let svg=document.getElementById('svg'), W,H, nodes=new Map(), links=[], sim, curMode=null, pathSel=[];
function auth(){return {'Authorization':'Bearer '+localStorage.gx_jwt,'workspace-id':localStorage.gx_ws};}
async function api(p){const r=await fetch('/graph-explorer/api'+p,{headers:auth()});if(!r.ok)throw new Error((await r.json()).error||r.status);return r.json();}
function connect(){localStorage.gx_ws=document.getElementById('ws').value.trim();localStorage.gx_jwt=document.getElementById('jwt').value.trim();boot();}
function resize(){W=svg.clientWidth;H=svg.clientHeight;}
window.addEventListener('resize',()=>{resize();});
function esc(s){return String(s??'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));}

async function boot(){
 document.getElementById('ws').value=localStorage.gx_ws||'';document.getElementById('jwt').value=localStorage.gx_jwt||'';
 if(!localStorage.gx_ws||!localStorage.gx_jwt)return;
 resize(); nodes.clear(); links=[];
 try{
   const m=await api('/metrics');
   document.getElementById('stat').innerHTML='nodes <b>'+m.nodeCount+'</b> · edges <b>'+m.edgeCount+'</b><br>avg degree '+m.avgDegree+' · density '+m.density+'<br>orphans '+m.orphanNodes;
   document.getElementById('legend').innerHTML=m.byNodeType.map(t=>'<div><span class=chip style="background:'+(COLORS[t.type]||'#889')+'"></span>'+t.type+' ('+t.c+')</div>').join('');
   const hubs=await api('/hubs');
   for(const h of hubs.slice(0,8)) addNode(h);
   for(const h of hubs.slice(0,8)) await expand(h.id,false);
   restart();
 }catch(e){document.getElementById('stat').textContent=e.message;}
}
function addNode(n){if(!nodes.has(n.id)){nodes.set(n.id,{id:n.id,type:n.type,name:n.name,x:W/2+(Math.random()-.5)*300,y:H/2+(Math.random()-.5)*300,vx:0,vy:0});}return nodes.get(n.id);}
function addLink(s,t,rel,at){if(nodes.has(s)&&nodes.has(t)&&!links.find(l=>l.s===s&&l.t===t&&l.rel===rel))links.push({s,t,rel,at});}
async function expand(id,restartAfter=true){
 try{const d=await api('/node/'+encodeURIComponent(id));
  if(d.node)addNode({id:d.node.id,type:d.node.type,name:d.node.name});
  for(const nb of d.neighbors){addNode(nb.node);
   if(nb.direction==='OUT')addLink(id,nb.node.id,nb.relation,nb.observedAt);else addLink(nb.node.id,id,nb.relation,nb.observedAt);}
  if(restartAfter)restart();applyTemporal();
 }catch(e){console.warn(e);}
}
async function doSearch(){const q=document.getElementById('q').value.trim();const el=document.getElementById('results');if(!q){el.innerHTML='';return;}
 try{const rows=await api('/search?q='+encodeURIComponent(q));el.innerHTML=rows.map(r=>'<div class=res onclick="focusNode(\\''+r.id+'\\',\\''+esc(r.type)+'\\',\\''+esc(r.name).replace(/\\x27/g,'')+'\\')">'+'<span class=chip style="background:'+(COLORS[r.type]||'#889')+'"></span>'+esc(r.name)+' <span class=k>'+r.type+'</span></div>').join('');}catch(e){el.textContent=e.message;}
}
async function focusNode(id,type,name){addNode({id,type,name});await expand(id);}
async function nodeClick(id){
 if(curMode==='impact'){const r=await api('/impact/'+encodeURIComponent(id));highlight(new Set(r.impacted.map(n=>n.id)),'#ff5c6c');document.getElementById('hint').textContent=name(id)+': '+r.impactedCount+' impacted (score '+r.impactScore+')';}
 else if(curMode==='dep'){const r=await api('/dependencies/'+encodeURIComponent(id));highlight(new Set(r.dependencies.map(n=>n.id)),'#4f8cff');document.getElementById('hint').textContent=name(id)+': '+r.dependencyCount+' dependencies';}
 else if(curMode==='path'){pathSel.push(id);if(pathSel.length===2){const r=await api('/path?from='+encodeURIComponent(pathSel[0])+'&to='+encodeURIComponent(pathSel[1]));if(r.found){for(const p of r.path)addNode(p);const ids=new Set(r.path.map(p=>p.id));highlight(ids,'#ffb454');document.getElementById('hint').textContent='path: '+r.path.map(p=>p.name).join(' → ');restart();}else document.getElementById('hint').textContent='no path';pathSel=[];}}
 else{expand(id);}
}
function name(id){return nodes.get(id)?.name||id;}
function mode(m){curMode=curMode===m?null:m;pathSel=[];for(const b of ['mImpact','mDep','mPath'])document.getElementById(b).classList.remove('on');if(curMode)document.getElementById('m'+(m==='dep'?'Dep':m==='path'?'Path':'Impact')).classList.add('on');}
function clearFx(){for(const c of svg.querySelectorAll('circle'))c.setAttribute('stroke','none');document.getElementById('days').value=0;applyTemporal();}
function highlight(ids,color){for(const [id,n] of nodes){const c=n.el;if(c){c.setAttribute('stroke',ids.has(id)?color:'none');c.setAttribute('stroke-width',ids.has(id)?3:0);}}}
function applyTemporal(){const days=+document.getElementById('days').value;const cut=days>0?Date.now()-days*864e5:0;for(const l of links){if(l.line){const show=!cut||(l.at&&new Date(l.at).getTime()>=cut);l.line.style.display=show?'':'none';if(l.tl)l.tl.style.display=show?'':'none';}}}

// ── force layout ─────────────────────────────────────────────────────────────
function restart(){
 svg.innerHTML='';
 const g=document.createElementNS(SVGNS,'g');svg.appendChild(g);
 for(const l of links){const ln=document.createElementNS(SVGNS,'line');ln.setAttribute('stroke','#2a3244');ln.setAttribute('stroke-width',1);g.appendChild(ln);l.line=ln;
   const tl=document.createElementNS(SVGNS,'text');tl.setAttribute('class','lbl');tl.textContent=l.rel;g.appendChild(tl);l.tl=tl;}
 for(const [id,n] of nodes){const c=document.createElementNS(SVGNS,'circle');c.setAttribute('r',Math.max(6,Math.min(16,4+ (linksOf(id))*0.5)));c.setAttribute('fill',COLORS[n.type]||'#889');c.style.cursor='pointer';c.onclick=()=>nodeClick(id);g.appendChild(c);n.el=c;
   const t=document.createElementNS(SVGNS,'text');t.setAttribute('class','nlbl');t.textContent=(n.name||'').slice(0,22);g.appendChild(t);n.tl=t;
   dragify(c,n);}
 applyTemporal();tick(120);
}
function linksOf(id){let n=0;for(const l of links)if(l.s===id||l.t===id)n++;return n;}
function tick(iters){
 for(let it=0;it<iters;it++){
  const arr=[...nodes.values()];
  for(let i=0;i<arr.length;i++){for(let j=i+1;j<arr.length;j++){const a=arr[i],b=arr[j];let dx=a.x-b.x,dy=a.y-b.y,d2=dx*dx+dy*dy||1;const f=1600/d2;const d=Math.sqrt(d2);a.vx+=f*dx/d;a.vy+=f*dy/d;b.vx-=f*dx/d;b.vy-=f*dy/d;}}
  for(const l of links){const a=nodes.get(l.s),b=nodes.get(l.t);if(!a||!b)continue;let dx=b.x-a.x,dy=b.y-a.y,d=Math.sqrt(dx*dx+dy*dy)||1;const f=(d-90)*0.02;a.vx+=f*dx/d;a.vy+=f*dy/d;b.vx-=f*dx/d;b.vy-=f*dy/d;}
  for(const n of nodes.values()){n.vx+=(W/2-n.x)*0.002;n.vy+=(H/2-n.y)*0.002;n.x+=n.vx*=0.85;n.y+=n.vy*=0.85;}
 }
 render();
}
function render(){for(const l of links){const a=nodes.get(l.s),b=nodes.get(l.t);if(!a||!b||!l.line)continue;l.line.setAttribute('x1',a.x);l.line.setAttribute('y1',a.y);l.line.setAttribute('x2',b.x);l.line.setAttribute('y2',b.y);l.tl.setAttribute('x',(a.x+b.x)/2);l.tl.setAttribute('y',(a.y+b.y)/2);}
 for(const n of nodes.values()){if(n.el){n.el.setAttribute('cx',n.x);n.el.setAttribute('cy',n.y);n.tl.setAttribute('x',n.x+10);n.tl.setAttribute('y',n.y+3);}}}
let raf;function loop(){tick(1);raf=requestAnimationFrame(loop);}
function dragify(c,n){c.onmousedown=e=>{e.preventDefault();const mv=ev=>{n.x=ev.clientX-250;n.y=ev.clientY-52;n.vx=n.vy=0;render();};const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);};document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);};}
cancelAnimationFrame(raf);loop();
boot();
</script></body></html>`;

export default router;
