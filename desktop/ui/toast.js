"use strict";
// Toast controller. The Rust side polls the clawleash daemon and pushes a
// "pending" event with the current pending list; it also owns showing/hiding
// the window. This script only renders the front request and resolves it.

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const el = {
  card: document.getElementById("card"),
  tool: document.getElementById("tool"),
  summary: document.getElementById("summary"),
  more: document.getElementById("more"),
  allow: document.getElementById("allow"),
  deny: document.getElementById("deny"),
};

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
  el.tool.textContent = top.tool || "Tool";
  el.summary.textContent = top.summary || "";
  if (list.length > 1) {
    el.more.textContent = `+${list.length - 1} more`;
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
    /* best-effort; the next poll reflects reality */
  } finally {
    busy = false;
    // Optimistically clear so we don't double-tap the same request before the
    // next "pending" event arrives.
    current = null;
  }
}

el.allow.addEventListener("click", () => decide("allow"));
el.deny.addEventListener("click", () => decide("deny"));

listen("pending", (e) => render(e.payload));

// Paint immediately on launch in case something is already pending.
invoke("get_pending").then(render).catch(() => {});
