"use strict";
// Push a short notification to a phone via ntfy.sh (free, open-source).
// The user installs the ntfy app and subscribes to their topic; we POST to it.
const https = require("https");

function pushNtfy(topic, title, message, opts = {}) {
  if (!topic || typeof topic !== "string") return;
  try {
    const body = Buffer.from(String(message == null ? "" : message), "utf8");
    // Title header must be ASCII; keep details in the (UTF-8) body.
    const asciiTitle = String(title || "clawleash").replace(/[^\x20-\x7E]/g, "").slice(0, 80) || "clawleash";
    const headers = {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": body.length,
      "Title": asciiTitle,
    };
    if (opts.tags) headers.Tags = String(opts.tags);
    if (opts.priority) headers.Priority = String(opts.priority);
    const req = https.request(
      { hostname: "ntfy.sh", path: "/" + encodeURIComponent(topic), method: "POST", headers, timeout: 4000 },
      (res) => { res.resume(); }
    );
    req.on("error", () => {});
    req.on("timeout", () => { try { req.destroy(); } catch {} });
    req.write(body);
    req.end();
  } catch { /* best-effort */ }
}

module.exports = { pushNtfy };
