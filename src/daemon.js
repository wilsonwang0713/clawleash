"use strict";
// The clawleash daemon: one HTTP server bound to 0.0.0.0.
//   - /hook/event, /hook/permission   ← Claude Code posts here (LOOPBACK ONLY)
//   - /, /api/status, /api/permission ← the phone (TOKEN-GATED, any interface)
//   - /manifest.webmanifest           ← public PWA asset
const http = require("http");
const { renderPage, manifestFor } = require("./mobile");
const { createRegistry } = require("./permissions");
const { createStatus } = require("./status");
const { pushNtfy } = require("./notify");
const fs = require("fs");
const path = require("path");

// The home-screen / favicon image, served publicly (not sensitive).
const ICON_PATH = path.join(__dirname, "..", "assets", "icon.png");
let _iconBuf = null;
function readIcon() {
  if (_iconBuf) return _iconBuf;
  try { _iconBuf = fs.readFileSync(ICON_PATH); } catch { _iconBuf = Buffer.alloc(0); }
  return _iconBuf;
}

// Settle a held permission well before Claude Code's 600s hook timeout so we
// can cleanly fall back to the terminal prompt if nobody answers.
const PERMISSION_TIMEOUT_MS = 9 * 60 * 1000;

function isLoopback(req) {
  const a = (req.socket && req.socket.remoteAddress) || "";
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}

function readBody(req, cap = 1 << 20) {
  return new Promise((resolve) => {
    let data = "";
    let over = false;
    req.on("data", (c) => { if (over) return; data += c; if (data.length > cap) over = true; });
    req.on("end", () => { try { resolve(over ? {} : JSON.parse(data || "{}")); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

function startDaemon({ getConfig, onLog } = {}) {
  const registry = createRegistry();
  const status = createStatus();
  const cfg = () => (typeof getConfig === "function" ? getConfig() : {}) || {};

  const server = http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, "http://localhost"); } catch { res.writeHead(400); res.end(); return; }
    const p = url.pathname;

    // ── Hook ingress — loopback only (Claude Code on the same machine) ──
    if (p === "/hook/event") {
      if (!isLoopback(req)) { res.writeHead(403); res.end(); return; }
      const body = await readBody(req);
      try { status.event(body); } catch { /* ignore */ }
      res.writeHead(200, { "Content-Type": "application/json" }); res.end("{}");
      return;
    }
    if (p === "/hook/permission") {
      if (!isLoopback(req)) { res.writeHead(403); res.end(); return; }
      const body = await readBody(req);
      const c = cfg();
      if (!c.approvals) { res.destroy(); return; } // off → Claude Code prompts in the terminal
      const tool = typeof body.tool_name === "string" ? body.tool_name : "Tool";
      const input = body.tool_input && typeof body.tool_input === "object" ? body.tool_input : {};
      const sessionId = body.session_id || "default";
      const decision = await registry.request(
        { tool, input, sessionId, project: "" },
        PERMISSION_TIMEOUT_MS,
        (pend) => {
          if (c.ntfyTopic) pushNtfy(c.ntfyTopic, "Permission needed", `${pend.tool}: ${pend.summary}`, { priority: "high", tags: "warning", token: c.ntfyToken, server: c.ntfyServer });
          if (onLog) onLog(`permission pending — ${pend.tool} (${pend.id})`);
        }
      );
      if (decision.decision === "timeout") { res.destroy(); return; } // fall back to terminal prompt
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PermissionRequest",
          decision: {
            behavior: decision.decision === "allow" ? "allow" : "deny",
            ...(decision.message ? { message: decision.message } : {}),
          },
        },
      }));
      return;
    }

    // ── Public app icon (no token) — apple-touch-icon / favicon / manifest icon ──
    if (p === "/icon.png") {
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" });
      res.end(readIcon());
      return;
    }

    // ── Token gate for everything phone-facing ──
    const token = cfg().token || "";
    if (!token || url.searchParams.get("k") !== token) {
      res.writeHead(403, { "Content-Type": "text/plain" }); res.end("forbidden");
      return;
    }
    // Token-gated so start_url can carry ?k= (fixes Home Screen 403).
    if (p === "/manifest.webmanifest") {
      res.writeHead(200, { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(manifestFor(token));
      return;
    }

    if (p === "/api/status") {
      const snap = status.snapshot();
      snap.pending = registry.list();
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(snap));
      return;
    }
    if (p === "/api/permission" && req.method === "POST") {
      const id = url.searchParams.get("id") || "";
      const behavior = url.searchParams.get("decision") === "allow" ? "allow" : "deny";
      const ok = registry.resolve(id, behavior);
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok }));
      return;
    }
    // default → the mobile page
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(renderPage(token));
  });

  server.on("error", (e) => { if (onLog) onLog("server error: " + (e && e.message)); });

  return {
    server,
    registry,
    status,
    listen(port, cb) { server.listen(port, "0.0.0.0", cb); return server; },
  };
}

module.exports = { startDaemon, PERMISSION_TIMEOUT_MS };
