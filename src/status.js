"use strict";
// In-memory live status fed by Claude Code hook events. Tracks per-session state
// and running subagents so the phone page can show "what's happening now".
const path = require("path");

const STATE_BY_EVENT = {
  SessionStart: "idle",
  UserPromptSubmit: "thinking",
  PreToolUse: "working",
  PostToolUse: "working",
  Stop: "idle",
  SubagentStart: "working",
  SubagentStop: "working",
};

function createStatus() {
  const sessions = new Map();   // sessionId -> { project, state, headless, updatedAt }
  const subagents = new Map();  // toolUseId -> { type, sessionId }

  function event(e) {
    const evt = e.event || e.hook_event_name || "";
    const sid = e.session_id || "default";

    if (evt === "SessionEnd") {
      sessions.delete(sid);
      for (const [k, v] of subagents) if (v.sessionId === sid) subagents.delete(k);
      return;
    }

    const s = sessions.get(sid) || { project: "", state: "idle", headless: false, updatedAt: 0 };
    if (e.cwd) s.project = path.basename(String(e.cwd));
    if (e.headless) s.headless = true;
    if (STATE_BY_EVENT[evt]) s.state = STATE_BY_EVENT[evt];
    s.updatedAt = Date.now();
    sessions.set(sid, s);

    const subType =
      (e.tool_input && typeof e.tool_input.subagent_type === "string" && e.tool_input.subagent_type) ||
      (typeof e.agent_type === "string" && e.agent_type) || "";
    if (subType && e.tool_use_id && (evt === "PreToolUse" || evt === "SubagentStart")) {
      subagents.set(e.tool_use_id, { type: subType, sessionId: sid });
    }
    if (e.tool_use_id && (evt === "PostToolUse" || evt === "SubagentStop")) {
      subagents.delete(e.tool_use_id);
    }
  }

  function snapshot() {
    const running = {};
    const agentsBySession = new Map();
    for (const [, v] of subagents) {
      if (!v.type) continue;
      running[v.type] = (running[v.type] || 0) + 1;
      const a = agentsBySession.get(v.sessionId) || [];
      a.push(v.type);
      agentsBySession.set(v.sessionId, a);
    }
    const sess = [];
    for (const [id, s] of sessions) {
      if (s.headless) continue;
      sess.push({ id, project: s.project, state: s.state, agents: agentsBySession.get(id) || [], updatedAt: s.updatedAt });
    }
    sess.sort((a, b) => b.updatedAt - a.updatedAt);
    return {
      running: Object.entries(running).map(([type, count]) => ({ type, count })),
      sessions: sess,
      liveSessions: sess.length,
    };
  }

  return { event, snapshot };
}

module.exports = { createStatus };
