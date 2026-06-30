"use strict";
// Toast controller. Rust polls the daemon and pushes a "pending" event; it also
// owns showing/hiding + bottom-right placement. This renders the front request.

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const el = {
  card: document.getElementById("card"),
  eyebrow: document.getElementById("eyebrow"),
  main: document.getElementById("main"),
  more: document.getElementById("more"),
  allow: document.getElementById("allow"),
  deny: document.getElementById("deny"),
};

// Heuristic: does this look destructive / irreversible?
const DANGER = /\b(rm\s+-[rf]+|rm\s+-[rf]+\s|sudo\b|mkfs|dd\s+if=|chmod\s+-R|chown\s+-R|--force|force-push|push\s+-f\b|reset\s+--hard|DROP\s+(TABLE|DATABASE)|DELETE\s+FROM|TRUNCATE|:\(\)\s*\{)/i;

let current = null; // id currently shown
let busy = false;   // a resolve is in flight

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
  if (!busy) {
    el.allow.disabled = false;
    el.deny.disabled = false;
  }
  el.card.hidden = false;
}

async function decide(decision) {
  if (!current || busy) return;
  busy = true;
  el.allow.disabled = true;
  el.deny.disabled = true;
  const id = current;
  try {
    await invoke("resolve_permission", { id, decision });
  } catch {
    /* best-effort; next event reflects reality */
  } finally {
    busy = false;
    current = null; // don't double-tap before the next event
  }
}

el.allow.addEventListener("click", () => decide("allow"));
el.deny.addEventListener("click", () => decide("deny"));

listen("pending", (e) => render(e.payload));
invoke("get_pending").then(render).catch(() => {});
