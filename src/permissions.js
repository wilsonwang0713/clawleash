"use strict";
// Pending permission registry. A PermissionRequest hook holds its HTTP request
// open; we park a resolver here and settle it when the phone (or a timeout)
// answers. The phone calls resolve(id, "allow"|"deny"); a timeout settles as
// "timeout" so the caller can let Claude Code fall back to its terminal prompt.
const path = require("path");

function summarize(tool, input) {
  const ti = input && typeof input === "object" ? input : {};
  const trim = (s, n) => {
    const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
  };
  if (tool === "Bash") return trim(ti.command, 90) || "Bash command";
  if (tool === "Write" || tool === "Edit" || tool === "MultiEdit" || tool === "NotebookEdit") {
    const f = ti.file_path || ti.notebook_path || "";
    return f ? `${tool} ${path.basename(String(f))}` : tool;
  }
  if (tool === "WebFetch") return trim(ti.url, 90) || "WebFetch";
  if (tool === "Read" && ti.file_path) return `Read ${path.basename(String(ti.file_path))}`;
  return tool || "Tool";
}

function createRegistry() {
  const pending = new Map(); // id -> { resolve, timer, tool, input, sessionId, project, createdAt }
  let counter = 0;

  function request({ tool, input, sessionId, project }, timeoutMs, onPending) {
    return new Promise((resolve) => {
      const id = `p${++counter}`;
      const timer = setTimeout(() => {
        if (pending.delete(id)) resolve({ decision: "timeout" });
      }, timeoutMs);
      pending.set(id, { resolve, timer, tool, input, sessionId, project, createdAt: Date.now() });
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
      createdAt: p.createdAt,
    }));
  }

  function resolve(id, decision) {
    const p = pending.get(id);
    if (!p) return false;
    clearTimeout(p.timer);
    pending.delete(id);
    p.resolve({
      decision: decision === "allow" ? "allow" : "deny",
      message: decision === "allow" ? undefined : "Denied from phone",
    });
    return true;
  }

  function size() { return pending.size; }

  return { request, list, resolve, size };
}

module.exports = { createRegistry, summarize };
