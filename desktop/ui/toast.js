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
let lastKey = "";   // pending-set signature; skip re-render (and selection wipe) when unchanged
let currentQuestions = []; // AskUserQuestion questions for the shown card (answerable only)

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
    lastKey = "";
    el.card.hidden = true;
    resetFit(); // next show re-fits → re-rounds
    return;
  }
  // The Rust poller re-emits "pending" every tick. Rebuilding the card each time
  // would wipe in-progress radio/checkbox selections, so skip when the pending
  // set is unchanged (same as mobile.js's lastPermKey guard).
  const key = list.map((p) => p.id).join(",");
  if (key === lastKey && !el.card.hidden) return;
  lastKey = key;
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

  // ExitPlanMode: show the plan text; Approve = allow, Keep planning = deny.
  const isPlan = tool === "ExitPlanMode";
  if (isPlan) {
    el.eyebrow.textContent = "PLAN REVIEW · clawleash";
    el.main.textContent = top.plan || detail;
  }
  el.main.classList.toggle("plan", isPlan);

  if (list.length > 1) {
    el.more.textContent = `+${list.length - 1}`;
    el.more.hidden = false;
  } else {
    el.more.hidden = true;
  }

  // AskUserQuestion "choose a direction": a radio/checkbox form (matches clawd-on-desk).
  const questions = Array.isArray(top.questions) ? top.questions : [];
  const isQuestion = questions.length > 0;
  currentQuestions = isQuestion && top.answerable ? questions : [];
  if (isQuestion) {
    el.eyebrow.textContent = `CHOOSE · ${tool}`;
    el.questions.innerHTML = "";
    questions.forEach((q, qi) => {
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
      if (!top.answerable) return;
      const hint = document.createElement("div");
      hint.className = "q-hint";
      hint.textContent = q.multiSelect ? "Choose at least one" : "Choose one";
      el.questions.appendChild(hint);
      for (const o of q.options || []) {
        const lab = document.createElement("label");
        lab.className = "q-opt";
        const input = document.createElement("input");
        input.type = q.multiSelect ? "checkbox" : "radio";
        input.name = `q${qi}`;
        input.value = o.label;
        input.dataset.q = String(qi);
        input.addEventListener("change", updateSubmitState);
        const copy = document.createElement("span");
        copy.className = "q-copy";
        const ol = document.createElement("span");
        ol.className = "q-label";
        ol.textContent = o.label;
        copy.appendChild(ol);
        if (o.description) {
          const d = document.createElement("span");
          d.className = "q-desc";
          d.textContent = o.description;
          copy.appendChild(d);
        }
        lab.appendChild(input);
        lab.appendChild(copy);
        el.questions.appendChild(lab);
      }
    });
    if (!top.answerable) {
      const note = document.createElement("div");
      note.className = "q-note";
      note.textContent = "No options — answer in the terminal.";
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

  // Question mode: Allow becomes a gated "Submit"; Deny becomes "Go to Terminal".
  const canSubmit = isQuestion && top.answerable;
  el.allow.hidden = isQuestion && !top.answerable; // no submit when there's nothing to answer
  el.allow.textContent = canSubmit ? "Submit" : (isPlan ? "Approve" : "Allow");
  el.deny.textContent = isQuestion ? "Go to Terminal" : (isPlan ? "Keep planning" : "Deny");

  if (!busy) {
    el.deny.disabled = false;
    el.allow.disabled = canSubmit ? !questionsComplete() : false;
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

// AskUserQuestion form: complete when every question has a selection.
function questionsComplete() {
  return currentQuestions.length > 0
    && currentQuestions.every((q, qi) => el.questions.querySelector(`input[data-q="${qi}"]:checked`));
}
function updateSubmitState() {
  if (currentQuestions.length && !busy) el.allow.disabled = !questionsComplete();
}
function collectAnswers() {
  const answers = {};
  currentQuestions.forEach((q, qi) => {
    const sel = [...el.questions.querySelectorAll(`input[data-q="${qi}"]:checked`)].map((x) => x.value);
    answers[q.question] = sel.join(", ");
  });
  return answers;
}
// Submit the collected answers as a map; the daemon folds them into updatedInput.
async function submit() {
  if (!current || busy || !questionsComplete()) return;
  const id = current;
  lock();
  try { await invoke("submit_answers", { id, answers: collectAnswers() }); }
  catch { /* next event reflects reality */ }
  finally { unlock(); }
}

el.allow.addEventListener("click", () => { if (currentQuestions.length) submit(); else decide("allow"); });
el.deny.addEventListener("click", () => decide("deny"));

listen("pending", (e) => render(e.payload));
invoke("get_pending").then(render).catch(() => {});
