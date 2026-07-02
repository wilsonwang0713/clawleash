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
  questions: document.getElementById("questions"),
  suggestions: document.getElementById("suggestions"),
  allow: document.getElementById("allow"),
  deny: document.getElementById("deny"),
};

// Heuristic: does this look destructive / irreversible?
const DANGER = /(?:\brm\s+-[rf]+|\bsudo\b|\bmkfs|\bdd\s+if=|chmod\s+-R|chown\s+-R|--force\b|force-push|push\s+-f\b|reset\s+--hard|\bDROP\s+(?:TABLE|DATABASE)|\bDELETE\s+FROM|\bTRUNCATE|:\(\)\s*\{)/i;

let current = null; // id currently shown
let busy = false;   // a resolve is in flight
let lastH = 0;      // last height we asked the window to be

function fit() {
  // scrollHeight = full natural content height even when the card is capped at
  // 100vh and scrolls (getBoundingClientRect would return the clamped height and
  // stick the window small). Rust clamps this to the usable screen height.
  const h = Math.ceil(el.card.scrollHeight);
  if (h > 0 && Math.abs(h - lastH) > 1) {
    lastH = h;
    invoke("fit_toast", { height: h }).catch(() => {});
  }
}

// Force a fit (and thus re-round) the next time the toast is shown.
function resetFit() { lastH = 0; }

function render(pending) {
  const list = Array.isArray(pending) ? pending : [];
  if (list.length === 0) {
    current = null;
    el.card.hidden = true;
    resetFit(); // next show re-fits → re-rounds
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

  // AskUserQuestion "choose a direction": render each question's options as buttons.
  const questions = Array.isArray(top.questions) ? top.questions : [];
  const isQuestion = questions.length > 0;
  if (isQuestion) {
    el.eyebrow.textContent = `CHOOSE · ${tool}`;
    el.questions.innerHTML = "";
    for (const q of questions) {
      if (q.header) {
        const h = document.createElement("div");
        h.className = "q-header";
        h.textContent = q.header;
        el.questions.appendChild(h);
      }
      const qt = document.createElement("div");
      qt.className = "q-text";
      qt.textContent = q.question;
      el.questions.appendChild(qt);
      if (top.answerable) {
        for (const o of q.options || []) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "q-opt";
          b.textContent = o.label;
          if (o.description) {
            const d = document.createElement("span");
            d.className = "q-desc";
            d.textContent = o.description;
            b.appendChild(d);
          }
          b.addEventListener("click", () => answer(o.i));
          el.questions.appendChild(b);
        }
      }
    }
    if (!top.answerable) {
      const note = document.createElement("div");
      note.className = "q-note";
      note.textContent = "Multi-select or multi-question — answer in the terminal.";
      el.questions.appendChild(note);
    }
    el.questions.hidden = false;
  } else {
    el.questions.hidden = true;
    el.questions.innerHTML = "";
  }

  // One-tap suggestions ("always allow …"). Not shown for AskUserQuestion.
  const sug = !isQuestion && Array.isArray(top.suggestions) ? top.suggestions : [];
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

  // For a question, there's no "Allow" — Deny becomes the "Go to Terminal" escape.
  el.allow.hidden = isQuestion;
  el.deny.textContent = isQuestion ? "Go to Terminal" : "Deny";

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

// AskUserQuestion: submit the picked option index; the daemon maps it to the
// option label and echoes it back to Claude Code via updatedInput.
async function answer(index) {
  if (!current || busy) return;
  const id = current;
  lock();
  try { await invoke("answer_question", { id, index }); }
  catch { /* next event reflects reality */ }
  finally { unlock(); }
}

el.allow.addEventListener("click", () => decide("allow"));
el.deny.addEventListener("click", () => decide("deny"));

listen("pending", (e) => render(e.payload));
invoke("get_pending").then(render).catch(() => {});
