"use strict";
// Idempotently install/remove clawleash's Claude Code hooks in ~/.claude/settings.json.
// All clawleash hooks are http hooks tagged with ?clawleash=1 so they can be
// found and removed cleanly without touching the user's other hooks.
const os = require("os");
const fs = require("fs");
const path = require("path");

const MARK = "clawleash=1";
const STATUS_EVENTS = [
  "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse",
  "Stop", "SubagentStart", "SubagentStop", "SessionEnd",
];

function settingsPath() {
  return path.join(os.homedir(), ".claude", "settings.json");
}

function read() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), "utf8")); }
  catch { return {}; }
}

function write(settings) {
  try { fs.mkdirSync(path.dirname(settingsPath()), { recursive: true }); } catch { /* ignore */ }
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

function isOurs(entry) {
  return entry && Array.isArray(entry.hooks) &&
    entry.hooks.some((h) => h && typeof h.url === "string" && h.url.includes("/hook/") && h.url.includes(MARK));
}

// Remove every clawleash-tagged hook entry from a settings object (mutates).
function strip(settings) {
  const hooks = settings.hooks;
  if (!hooks || typeof hooks !== "object") return settings;
  for (const evt of Object.keys(hooks)) {
    if (!Array.isArray(hooks[evt])) continue;
    hooks[evt] = hooks[evt].filter((entry) => !isOurs(entry));
    if (hooks[evt].length === 0) delete hooks[evt];
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
  return settings;
}

function install(port) {
  const settings = strip(read());
  settings.hooks = settings.hooks || {};
  const add = (evt, entry) => { (settings.hooks[evt] = settings.hooks[evt] || []).push(entry); };

  add("PermissionRequest", {
    matcher: "*",
    hooks: [{ type: "http", url: `http://127.0.0.1:${port}/hook/permission?${MARK}`, timeout: 600 }],
  });
  for (const evt of STATUS_EVENTS) {
    add(evt, {
      matcher: "*",
      hooks: [{ type: "http", url: `http://127.0.0.1:${port}/hook/event?${MARK}`, timeout: 5 }],
    });
  }
  write(settings);
}

function uninstall() {
  write(strip(read()));
}

function isInstalled(port) {
  const hooks = read().hooks;
  if (!hooks || !Array.isArray(hooks.PermissionRequest)) return false;
  return hooks.PermissionRequest.some((entry) =>
    entry && Array.isArray(entry.hooks) &&
    entry.hooks.some((h) => h && typeof h.url === "string" && h.url.includes(`:${port}/hook/`) && h.url.includes(MARK)));
}

module.exports = { install, uninstall, isInstalled, settingsPath };
