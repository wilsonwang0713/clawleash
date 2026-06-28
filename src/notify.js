"use strict";
// Push a short notification to a phone via ntfy.sh (free, open-source).
// The user installs the ntfy app and subscribes to their topic; we POST to it.
const https = require("https");

// ntfy topics must be URL-safe ([-_A-Za-z0-9]{1,64}). Clean anything else so a
// topic with spaces/punctuation doesn't silently fail to deliver.
function sanitizeNtfyTopic(value) {
  return String(value == null ? "" : value)
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 64);
}

function pushNtfy(topic, title, message, opts = {}) {
  const t = sanitizeNtfyTopic(topic);
  if (!t) return;
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
      { hostname: "ntfy.sh", path: "/" + t, method: "POST", headers, timeout: 4000 },
      (res) => { res.resume(); }
    );
    req.on("error", () => {});
    req.on("timeout", () => { try { req.destroy(); } catch {} });
    req.write(body);
    req.end();
  } catch { /* best-effort */ }
}

module.exports = { pushNtfy, sanitizeNtfyTopic };
