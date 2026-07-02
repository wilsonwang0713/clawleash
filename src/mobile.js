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
.pqblock{margin-bottom:14px}.pqblock:last-of-type{margin-bottom:11px}
.pqh{font-size:11px;color:var(--acc);font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px}
.pq{font-size:15px;font-weight:600;margin:0 0 2px;word-break:break-word}
.pqhint{font-size:12px;color:var(--dim);margin:0 0 8px}
.popts{display:flex;flex-direction:column;gap:6px}
.popt{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--bd);border-radius:10px;cursor:pointer}
.popt:has(input:checked){border-color:var(--acc);background:rgba(217,119,87,.08)}
.popt input{margin:1px 0 0;width:18px;height:18px;accent-color:var(--acc);flex:none}
.popt .ol{font-size:15px;font-weight:600;display:block}
.popt .od{font-size:12px;color:var(--mut);margin-top:2px;display:block}
.pnote{font-size:12px;color:var(--mut);margin:2px 0 10px}
.pbtns .psubmit{background:var(--ok)}.pbtns .psubmit:disabled{opacity:.4}
.pbtns .term{background:var(--card);border:1px solid var(--bd);color:var(--mut)}
</style></head><body>
<header><h1>🦀 clawleash</h1><p id="sub">connecting…</p></header>
<div id="perms"></div>
<div class="card"><h2>Sessions</h2><div id="sessions"><div class="none">—</div></div></div>
<div class="card"><h2>Running now</h2><div id="running"><div class="none">—</div></div></div>
<div id="ts"></div>
<script>
var K=${JSON.stringify(token || "")};
function esc(s){var d=document.createElement('div');d.textContent=s==null?'':s;return d.innerHTML}
var permData={};   // id -> normalized questions (for building the answers map on submit)
var lastPermKey=''; // skip re-render while the pending set is unchanged (preserves in-progress selections)
function post(id,qs){fetch('/api/permission?k='+encodeURIComponent(K)+'&id='+encodeURIComponent(id)+'&'+qs,{method:'POST'}).then(function(){tick()}).catch(function(){});}
// AskUserQuestion: gather the checked options per question → { <question>: "<label(s)>" } → POST as JSON.
function submitAnswers(id){
 var card=document.querySelector('.card[data-perm="'+id+'"]');if(!card)return;
 var qs=permData[id]||[];var answers={};
 for(var qi=0;qi<qs.length;qi++){
  var sel=[].slice.call(card.querySelectorAll('input[data-q="'+qi+'"]:checked')).map(function(x){return x.value});
  if(!sel.length)return; // incomplete — shouldn't happen (submit is gated)
  answers[qs[qi].question]=sel.join(', ');
 }
 fetch('/api/permission?k='+encodeURIComponent(K)+'&id='+encodeURIComponent(id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answers:answers})}).then(function(){tick()}).catch(function(){});
}
function updateSubmit(card){
 var id=card.getAttribute('data-perm');var qs=permData[id]||[];var sb=card.querySelector('.psubmit');if(!sb)return;
 var ok=qs.length>0;
 for(var qi=0;qi<qs.length;qi++){if(!card.querySelector('input[data-q="'+qi+'"]:checked')){ok=false;break;}}
 sb.disabled=!ok;
}
document.getElementById('perms').addEventListener('change',function(e){var card=e.target.closest&&e.target.closest('.card[data-perm]');if(card)updateSubmit(card);});
document.getElementById('perms').addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('button[data-id]');if(!b)return;
 var id=b.getAttribute('data-id');
 if(b.getAttribute('data-act')==='submit'){b.disabled=true;submitAnswers(id);return;}
 b.disabled=true;
 var s=b.getAttribute('data-s');
 if(s!==null){post(id,'s='+encodeURIComponent(s));}
 else{post(id,'decision='+b.getAttribute('data-d'));}});
function renderPerms(list){var el=document.getElementById('perms');if(!list||!list.length){el.innerHTML='';permData={};return}
 permData={};
 el.innerHTML=list.map(function(p){
  var head='<div class="ptool">'+esc(p.tool)+(p.project?' · '+esc(p.project):'')+'</div>';
  // AskUserQuestion "choose a direction": a radio/checkbox form (matches clawd-on-desk).
  if(p.questions&&p.questions.length){
   permData[p.id]=p.questions;
   var qs=p.questions.map(function(q,qi){
    var opts='';
    if(p.answerable){
     var typ=q.multiSelect?'checkbox':'radio';var hint=q.multiSelect?'Choose at least one':'Choose one';
     opts=(q.options||[]).map(function(o){return '<label class="popt"><input type="'+typ+'" name="q_'+esc(p.id)+'_'+qi+'" data-q="'+qi+'" value="'+esc(o.label)+'"><span><span class="ol">'+esc(o.label)+'</span>'+(o.description?'<span class="od">'+esc(o.description)+'</span>':'')+'</span></label>';}).join('');
     opts='<div class="pqhint">'+hint+'</div><div class="popts">'+opts+'</div>';
    }
    return '<div class="pqblock">'+(q.header?'<div class="pqh">'+esc(q.header)+'</div>':'')+'<div class="pq">'+esc(q.question)+'</div>'+opts+'</div>';
   }).join('');
   var note=p.answerable?'':'<div class="pnote">No options — answer this one in the terminal.</div>';
   var submit=p.answerable?'<button class="psubmit" data-id="'+esc(p.id)+'" data-act="submit" disabled>Submit</button>':'';
   return '<div class="card perm" data-perm="'+esc(p.id)+'">'+head+qs+note+'<div class="pbtns">'+submit+'<button class="term" data-id="'+esc(p.id)+'" data-d="deny">Go to Terminal</button></div></div>';
  }
  var sug=(p.suggestions||[]).map(function(s){return '<button data-id="'+esc(p.id)+'" data-s="'+s.i+'">'+esc(s.label)+'</button>';}).join('');
  return '<div class="card perm">'+head+'<div class="psum">'+esc(p.summary)+'</div>'+(sug?'<div class="psug">'+sug+'</div>':'')+'<div class="pbtns"><button class="allow" data-id="'+esc(p.id)+'" data-d="allow">Allow</button><button class="deny" data-id="'+esc(p.id)+'" data-d="deny">Deny</button></div></div>';}).join('');}
function renderSessions(list){var el=document.getElementById('sessions');if(!list||!list.length){el.innerHTML='<div class="none">no live sessions</div>';return}
 el.innerHTML=list.map(function(s){var st=s.state||'idle';var sub=(s.agents&&s.agents.length)?s.agents.join(', '):st;
  return '<div class="bub"><div class="crab">🦀</div><div class="say"><div class="ttl">'+esc(s.project||'session')+'<span class="st s-'+esc(st)+'">'+esc(st)+'</span></div><div class="subl">'+esc(sub)+'</div></div></div>';}).join('');}
function tick(){fetch('/api/status?k='+encodeURIComponent(K)).then(function(r){return r.json()}).then(function(d){
  var run=d.running||[];var p=d.pending||[];
  document.getElementById('sub').textContent=(d.liveSessions||0)+' live session'+(d.liveSessions===1?'':'s')+(p.length?' · '+p.length+' awaiting you':'');
  // Only re-render perms when the pending set changes, so a 5s poll doesn't wipe
  // half-filled answer selections while the user is choosing.
  var pkey=p.map(function(x){return x.id}).join(',');
  if(pkey!==lastPermKey){lastPermKey=pkey;renderPerms(p);}
  renderSessions(d.sessions);
  document.getElementById('running').innerHTML=run.length?run.map(function(x){return '<div class="row run"><span><span class="dot"></span>'+esc(x.type)+'</span><span class="muted">'+(x.count>1?'×'+x.count:'running')+'</span></div>'}).join(''):'<div class="none">nothing running</div>';
  document.getElementById('ts').textContent='updated '+new Date().toLocaleTimeString();
 }).catch(function(){document.getElementById('sub').textContent='disconnected — is your Mac awake?'});}
tick();setInterval(tick,5000);
</script></body></html>`;
}

module.exports = { renderPage, manifestFor };
