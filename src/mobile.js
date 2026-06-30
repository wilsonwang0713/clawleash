"use strict";
// The phone-facing page: a token-gated, installable PWA. Polls /api/status and
// renders pending allow/deny permission cards + live session bubbles. Tapping a
// button POSTs to /api/permission.

function manifestFor(token) {
  return JSON.stringify({
    name: "clawleash",
    short_name: "clawleash",
    display: "standalone",
    background_color: "#1c1c1f",
    theme_color: "#1c1c1f",
    scope: "/",
    // Bake the token in: the Home Screen launch uses start_url, NOT the URL you
    // added — without it the launched PWA would hit a tokenless URL and 403.
    start_url: "/?k=" + encodeURIComponent(token || ""),
    icons: [{ src: "/icon.png", sizes: "1254x1254", type: "image/png", purpose: "any" }],
  });
}

function renderPage(token) {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>clawleash</title>
<link rel="icon" href="/icon.png">
<link rel="apple-touch-icon" href="/icon.png">
<link rel="manifest" href="/manifest.webmanifest?k=${encodeURIComponent(token || "")}">
<meta name="theme-color" content="#1c1c1f">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="clawleash">
<style>
:root{--bg:#1c1c1f;--card:#232327;--fg:#f4f4f5;--mut:#a1a1aa;--dim:#71717a;--acc:#d97757;--ok:#3fb950;--bad:#f85149;--bd:rgba(255,255,255,.08)}
@media(prefers-color-scheme:light){:root{--bg:#f5f5f7;--card:#fff;--fg:#18181b;--mut:#6b6b70;--dim:#9b9ba0;--bd:rgba(0,0,0,.08)}}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--fg);padding:env(safe-area-inset-top) 0 40px}
header{padding:18px 16px 6px}h1{font-size:18px;margin:0}#sub{font-size:12px;color:var(--mut);margin:4px 0 0}
.card{background:var(--card);border:1px solid var(--bd);border-radius:14px;margin:12px 16px;padding:14px 16px}
.card h2{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--dim);margin:0 0 10px;font-weight:600}
.row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-top:1px solid var(--bd);font-size:14px}
.row:first-of-type{border-top:none}.run .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--acc);margin-right:8px;animation:p 1s infinite}
@keyframes p{0%,100%{opacity:1}50%{opacity:.3}}.muted{color:var(--mut)}.none{color:var(--dim);font-size:14px;padding:6px 0}
#ts{font-size:11px;color:var(--dim);text-align:center;margin-top:16px}
.bub{display:flex;align-items:flex-start;gap:8px;margin:12px 0}.bub:first-child{margin-top:0}
.crab{font-size:24px;line-height:1.1;flex:none}
.say{position:relative;background:var(--bg);border:1px solid var(--bd);border-radius:14px;padding:9px 12px;flex:1;min-width:0}
.say:before{content:"";position:absolute;left:-7px;top:13px;border:6px solid transparent;border-right-color:var(--bd);border-left:0}
.ttl{font-size:14px;font-weight:600;word-break:break-word}.subl{font-size:12px;color:var(--mut);margin-top:2px;word-break:break-word}
.st{font-size:10px;font-weight:700;text-transform:uppercase;padding:1px 6px;border-radius:6px;margin-left:6px}
.s-working,.s-thinking{background:rgba(217,119,87,.18);color:var(--acc)}.s-idle{background:var(--bd);color:var(--dim)}
.perm{border-color:var(--acc)}.ptool{font-size:11px;color:var(--acc);font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.psum{font-size:14px;margin:5px 0 11px;word-break:break-word;font-family:ui-monospace,Menlo,monospace}
.pbtns{display:flex;gap:8px}.pbtns button{flex:1;border:0;border-radius:10px;padding:12px;font-size:15px;font-weight:600;color:#fff}
.allow{background:var(--ok)}.deny{background:var(--bad)}.pbtns button:active{opacity:.65}
.psug{display:flex;flex-direction:column;gap:6px;margin-bottom:9px}
.psug button{border:1px solid var(--acc);background:transparent;color:var(--acc);border-radius:10px;padding:10px 12px;font-size:13px;font-weight:600;text-align:left;width:100%}
.psug button:active{opacity:.6}
</style></head><body>
<header><h1>🦀 clawleash</h1><p id="sub">connecting…</p></header>
<div id="perms"></div>
<div class="card"><h2>Sessions</h2><div id="sessions"><div class="none">—</div></div></div>
<div class="card"><h2>Running now</h2><div id="running"><div class="none">—</div></div></div>
<div id="ts"></div>
<script>
var K=${JSON.stringify(token || "")};
function esc(s){var d=document.createElement('div');d.textContent=s==null?'':s;return d.innerHTML}
function post(id,qs){fetch('/api/permission?k='+encodeURIComponent(K)+'&id='+encodeURIComponent(id)+'&'+qs,{method:'POST'}).then(function(){tick()}).catch(function(){});}
document.getElementById('perms').addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('button[data-id]');if(!b)return;b.disabled=true;
 var s=b.getAttribute('data-s');
 if(s!==null){post(b.getAttribute('data-id'),'s='+encodeURIComponent(s));}
 else{post(b.getAttribute('data-id'),'decision='+b.getAttribute('data-d'));}});
function renderPerms(list){var el=document.getElementById('perms');if(!list||!list.length){el.innerHTML='';return}
 el.innerHTML=list.map(function(p){
  var sug=(p.suggestions||[]).map(function(s){return '<button data-id="'+esc(p.id)+'" data-s="'+s.i+'">'+esc(s.label)+'</button>';}).join('');
  return '<div class="card perm"><div class="ptool">'+esc(p.tool)+(p.project?' · '+esc(p.project):'')+'</div><div class="psum">'+esc(p.summary)+'</div>'+(sug?'<div class="psug">'+sug+'</div>':'')+'<div class="pbtns"><button class="allow" data-id="'+esc(p.id)+'" data-d="allow">Allow</button><button class="deny" data-id="'+esc(p.id)+'" data-d="deny">Deny</button></div></div>';}).join('');}
function renderSessions(list){var el=document.getElementById('sessions');if(!list||!list.length){el.innerHTML='<div class="none">no live sessions</div>';return}
 el.innerHTML=list.map(function(s){var st=s.state||'idle';var sub=(s.agents&&s.agents.length)?s.agents.join(', '):st;
  return '<div class="bub"><div class="crab">🦀</div><div class="say"><div class="ttl">'+esc(s.project||'session')+'<span class="st s-'+esc(st)+'">'+esc(st)+'</span></div><div class="subl">'+esc(sub)+'</div></div></div>';}).join('');}
function tick(){fetch('/api/status?k='+encodeURIComponent(K)).then(function(r){return r.json()}).then(function(d){
  var run=d.running||[];var p=d.pending||[];
  document.getElementById('sub').textContent=(d.liveSessions||0)+' live session'+(d.liveSessions===1?'':'s')+(p.length?' · '+p.length+' awaiting you':'');
  renderPerms(p);renderSessions(d.sessions);
  document.getElementById('running').innerHTML=run.length?run.map(function(x){return '<div class="row run"><span><span class="dot"></span>'+esc(x.type)+'</span><span class="muted">'+(x.count>1?'×'+x.count:'running')+'</span></div>'}).join(''):'<div class="none">nothing running</div>';
  document.getElementById('ts').textContent='updated '+new Date().toLocaleTimeString();
 }).catch(function(){document.getElementById('sub').textContent='disconnected — is your Mac awake?'});}
tick();setInterval(tick,5000);
</script></body></html>`;
}

module.exports = { renderPage, manifestFor };
