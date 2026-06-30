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

function summarize(tool, input) {
  const ti = input && typeof input === "object" ? input : {};
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
    return [...pending.entries()].map(([id, p]) => ({
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
      createdAt: p.createdAt,
    }));
  }

  // choice: "allow" | "deny" | { suggestion: <index> }
  function resolve(id, choice) {
    const p = pending.get(id);
    if (!p) return false;

    let settled;
    if (choice && typeof choice === "object" && Number.isInteger(choice.suggestion)) {
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

module.exports = { createRegistry, summarize, labelSuggestion };
