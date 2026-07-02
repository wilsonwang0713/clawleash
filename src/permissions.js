"use strict";
// Pending permission registry. A PermissionRequest hook holds its HTTP request
// open; we park a resolver here and settle it when the phone (or a timeout)
// answers. The phone calls resolve(id, "allow"|"deny"|{suggestion:N}); a timeout
// settles as "timeout" so the caller can let Claude Code fall back to its
// terminal prompt.
const path = require("path");

function trim(s, n) {
  const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

// Caps so a large AskUserQuestion prompt can't blow up the phone / toast layout.
// Mirrors clawd-on-desk's elicitation limits.
const MAX_QUESTIONS = 4;
const MAX_OPTIONS = 5;
const LIMITS = { header: 48, question: 240, label: 80, description: 160 };

// AskUserQuestion carries its choices in tool_input.questions[]. Normalize into a
// compact, length-clamped shape the UIs render as option buttons. Each option gets
// a stable index `i` the phone posts back to pick it.
function normalizeQuestions(input) {
  const ti = input && typeof input === "object" ? input : {};
  if (!Array.isArray(ti.questions)) return [];
  return ti.questions.slice(0, MAX_QUESTIONS).map((q) => {
    const qq = q && typeof q === "object" ? q : {};
    const options = (Array.isArray(qq.options) ? qq.options : [])
      .slice(0, MAX_OPTIONS)
      .map((o, i) => {
        const oo = o && typeof o === "object" ? o : {};
        return {
          i,
          label: trim(oo.label, LIMITS.label),
          description: trim(oo.description, LIMITS.description),
        };
      });
    return {
      header: trim(qq.header, LIMITS.header),
      question: trim(qq.question, LIMITS.question),
      multiSelect: !!qq.multiSelect,
      options,
    };
  });
}

// v1 can answer remotely only the simplest case: one single-select question with
// options. Everything else (multi-select, multiple questions, no options) falls
// back to "Go to Terminal" (a plain deny → Claude Code re-prompts in the terminal).
function isAnswerable(questions) {
  return questions.length === 1
    && !questions[0].multiSelect
    && questions[0].options.length > 0;
}

// Build the tool_input echoed back to Claude Code with the picked answers folded
// in, so the AskUserQuestion tool resolves without a terminal prompt. Mirrors
// clawd-on-desk buildElicitationUpdatedInput: answers is { <question text>: <label> }.
function buildAnswerUpdatedInput(toolInput, answers) {
  const input = toolInput && typeof toolInput === "object" ? toolInput : {};
  const questions = Array.isArray(input.questions) ? input.questions : [];
  const normalizedAnswers = {};
  for (const q of questions) {
    if (!q || typeof q.question !== "string" || !q.question) continue;
    const a = answers && Object.prototype.hasOwnProperty.call(answers, q.question)
      ? answers[q.question]
      : undefined;
    if (typeof a === "string" && a.trim()) normalizedAnswers[q.question] = a.trim();
  }
  return { ...input, questions, answers: normalizedAnswers };
}

function summarize(tool, input) {
  const ti = input && typeof input === "object" ? input : {};
  if (tool === "AskUserQuestion") {
    const qs = Array.isArray(ti.questions) ? ti.questions : [];
    const first = qs[0] && typeof qs[0] === "object" ? qs[0] : {};
    return trim(first.question || first.header, 90) || "Choose an option";
  }
  if (tool === "Bash") return trim(ti.command, 90) || "Bash command";
  if (tool === "Write" || tool === "Edit" || tool === "MultiEdit" || tool === "NotebookEdit") {
    const f = ti.file_path || ti.notebook_path || "";
    return f ? `${tool} ${path.basename(String(f))}` : tool;
  }
  if (tool === "WebFetch") return trim(ti.url, 90) || "WebFetch";
  if (tool === "Read" && ti.file_path) return `Read ${path.basename(String(ti.file_path))}`;
  return tool || "Tool";
}

// Human-readable label for a Claude Code permission_suggestion (e.g. the
// "allow and don't ask again" options). Mirrors the shape clawd-on-desk reads:
// { type:"addRules", behavior, rules:[{toolName, ruleContent}], destination }.
function labelSuggestion(s) {
  if (!s || typeof s !== "object") return "Allow with rule";
  if (s.title) return trim(s.title, 60);
  if (s.type === "addRules") {
    const rules = Array.isArray(s.rules)
      ? s.rules
      : [{ toolName: s.toolName, ruleContent: s.ruleContent }];
    const what = rules
      .map((r) => [r && r.toolName, r && r.ruleContent].filter(Boolean).join(" "))
      .filter(Boolean)
      .join(", ");
    const verb = s.behavior === "deny" ? "Always deny" : "Always allow";
    return what ? `${verb} ${trim(what, 50)}` : `${verb} this`;
  }
  return s.behavior === "deny" ? "Deny with rule" : "Allow with rule";
}

function createRegistry() {
  const pending = new Map(); // id -> { resolve, timer, tool, input, sessionId, project, suggestions, createdAt }
  let counter = 0;

  function request({ tool, input, sessionId, project, suggestions }, timeoutMs, onPending) {
    return new Promise((resolve) => {
      const id = `p${++counter}`;
      const sugg = Array.isArray(suggestions) ? suggestions.filter((x) => x && typeof x === "object") : [];
      const timer = setTimeout(() => {
        if (pending.delete(id)) resolve({ decision: "timeout" });
      }, timeoutMs);
      pending.set(id, { resolve, timer, tool, input, sessionId, project, suggestions: sugg, createdAt: Date.now() });
      if (onPending) {
        try { onPending({ id, tool, summary: summarize(tool, input), project: project || "", sessionId: sessionId || "" }); }
        catch { /* best-effort */ }
      }
    });
  }

  function list() {
    return [...pending.entries()].map(([id, p]) => {
      const questions = p.tool === "AskUserQuestion" ? normalizeQuestions(p.input) : [];
      return {
        id,
        tool: p.tool,
        summary: summarize(p.tool, p.input),
        project: p.project || "",
        sessionId: p.sessionId || "",
        // Extra one-tap options (e.g. "always allow …"). Index i is what the phone
        // posts back to pick one.
        suggestions: (p.suggestions || []).map((s, i) => ({
          i,
          label: labelSuggestion(s),
          behavior: s.behavior === "deny" ? "deny" : "allow",
        })),
        // AskUserQuestion "choose a direction" prompts: options render as buttons.
        questions,
        answerable: isAnswerable(questions),
        createdAt: p.createdAt,
      };
    });
  }

  // choice: "allow" | "deny" | { suggestion: <index> } | { answer: <option index> }
  function resolve(id, choice) {
    const p = pending.get(id);
    if (!p) return false;

    let settled;
    if (choice && typeof choice === "object" && Number.isInteger(choice.answer)) {
      // AskUserQuestion single-select answer: map the picked option index to its
      // label and echo it back via updatedInput so Claude Code proceeds remotely.
      const questions = normalizeQuestions(p.input);
      if (!isAnswerable(questions)) return false;
      const opt = questions[0].options[choice.answer];
      if (!opt) return false;
      const qText = (Array.isArray(p.input.questions) ? p.input.questions[0] : {}).question;
      const answers = qText ? { [qText]: opt.label } : {};
      settled = {
        decision: "allow",
        updatedInput: buildAnswerUpdatedInput(p.input, answers),
      };
    } else if (choice && typeof choice === "object" && Number.isInteger(choice.suggestion)) {
      const s = (p.suggestions || [])[choice.suggestion];
      if (!s) return false;
      settled = {
        decision: s.behavior === "deny" ? "deny" : "allow",
        updatedPermissions: [s],
      };
    } else if (choice === "allow") {
      settled = { decision: "allow" };
    } else {
      settled = { decision: "deny", message: "Denied from phone" };
    }

    clearTimeout(p.timer);
    pending.delete(id);
    p.resolve(settled);
    return true;
  }

  function size() { return pending.size; }

  return { request, list, resolve, size };
}

module.exports = { createRegistry, summarize, labelSuggestion, normalizeQuestions, isAnswerable, buildAnswerUpdatedInput };
