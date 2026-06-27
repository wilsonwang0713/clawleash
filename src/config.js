"use strict";
// Tiny JSON config under the OS config dir. Holds the secret token, port, and
// toggles. The token gates the phone-facing routes.
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_PORT = 4271;

function configDir() {
  const home = os.homedir();
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "clawleash");
  }
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "clawleash");
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "clawleash");
}

function configPath() {
  return path.join(configDir(), "config.json");
}

function load() {
  try { return JSON.parse(fs.readFileSync(configPath(), "utf8")); }
  catch { return {}; }
}

function save(cfg) {
  try { fs.mkdirSync(configDir(), { recursive: true }); } catch { /* ignore */ }
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

// Load + fill defaults (generate a token on first run). Idempotent.
function ensure() {
  const cfg = load();
  let changed = false;
  if (!cfg.token) { cfg.token = crypto.randomBytes(12).toString("hex"); changed = true; }
  if (!cfg.port) { cfg.port = Number(process.env.CLAWLEASH_PORT) || DEFAULT_PORT; changed = true; }
  if (typeof cfg.approvals !== "boolean") { cfg.approvals = true; changed = true; }
  if (typeof cfg.ntfyTopic !== "string") { cfg.ntfyTopic = ""; changed = true; }
  if (changed) save(cfg);
  return cfg;
}

module.exports = { configDir, configPath, load, save, ensure, DEFAULT_PORT };
