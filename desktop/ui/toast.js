"use strict";
// Toast controller. Rust polls the daemon and pushes a "pending" event; it also
// owns showing/hiding + bottom-right placement. This renders the front request,
// resizes the window to fit, and resolves via Allow/Deny or a one-tap suggestion.

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const el = {
  card: document.getElementById("card"),
  eyebrow: document.getElementById("eyebrow"),
  main: document.getElementById("main"),
  more: document.getElementById("more"),
  suggestions: document.getElementById("suggestions"),
  allow: document.getElementById("allow"),
  deny: document.getElementById("deny"),
};

// Heuristic: does this look destructive / irreversible?
const DANGER = /(?:\brm\s+-[rf]+|\bsudo\b|\bmkfs|\bdd\s+if=|chmod\s+-R|chown\s+-R|--force\b|force-push|push\s+-f\b|reset\s+--hard|\bDROP\s+(?:TABLE|DATABASE)|\bDELETE\s+FROM|\bTRUNCATE|:\(\)\s*\{)/i;

let current = null; // id currently shown
let busy = false;   // a resolve is in flight

// Always re-fit on render. The set_size it triggers also forces the (release)
// webview to repaint transparent — without it, a non-resized toast can render an
// opaque square instead of the rounded card.
function fit() {
  const h = Math.ceil(el.card.getBoundingClientRect().height);
  if (h > 0) {
    invoke("fit_toast", { height: h }).catch(() => {});
  }
}

function render(pending) {
  const list = Array.isArray(pending) ? pending : [];
  if (list.length === 0) {
    current = null;
    el.card.hidden = true;
    return;
  }
  const top = list[0];
  current = top.id;

  const tool = top.tool || "Tool";
  let detail = top.summary || tool;
  // Avoid showing the tool name twice ("Write Glass.swift" → "Glass.swift").
  if (detail.toLowerCase().startsWith(tool.toLowerCase() + " ")) {
    detail = detail.slice(tool.length + 1);
  }

  const danger = DANGER.test(`${tool} ${top.summary || ""}`);
  el.card.classList.toggle("danger", danger);
  el.eyebrow.textContent = danger ? `⚠ DESTRUCTIVE · ${tool}` : `${tool} · clawleash`;
  el.main.textContent = detail;

  if (list.length > 1) {
    el.more.textContent = `+${list.length - 1}`;
    el.more.hidden = false;
  } else {
    el.more.hidden = true;
  }

  // One-tap suggestions ("always allow …").
  const sug = Array.isArray(top.suggestions) ? top.suggestions : [];
  if (sug.length) {
    el.suggestions.innerHTML = "";
    for (const s of sug) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = s.label;
      b.addEventListener("click", () => pick(s.i));
      el.suggestions.appendChild(b);
    }
    el.suggestions.hidden = false;
  } else {
    el.suggestions.hidden = true;
    el.suggestions.innerHTML = "";
  }

  if (!busy) {
    el.allow.disabled = false;
    el.deny.disabled = false;
  }
  el.card.hidden = false;
  // Resize the window to the rendered card height (after layout settles).
  requestAnimationFrame(fit);
}

function lock() {
  busy = true;
  el.allow.disabled = true;
  el.deny.disabled = true;
}
function unlock() {
  busy = false;
  current = null; // don't double-tap before the next event
}

async function decide(decision) {
  if (!current || busy) return;
  const id = current;
  lock();
  try { await invoke("resolve_permission", { id, decision }); }
  catch { /* next event reflects reality */ }
  finally { unlock(); }
}

async function pick(index) {
  if (!current || busy) return;
  const id = current;
  lock();
  try { await invoke("pick_suggestion", { id, index }); }
  catch { /* next event reflects reality */ }
  finally { unlock(); }
}

el.allow.addEventListener("click", () => decide("allow"));
el.deny.addEventListener("click", () => decide("deny"));

listen("pending", (e) => render(e.payload));
invoke("get_pending").then(render).catch(() => {});
