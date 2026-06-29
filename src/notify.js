"use strict";
// Push a short notification to a phone via ntfy (default ntfy.sh — free, open
// source). The user installs the ntfy app and subscribes to their topic; we POST
// to it. Optionally an access token and/or a custom (self-hosted) server can be
// supplied, so the channel is protected by real auth instead of relying purely
// on the topic being hard to guess.
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

// Accept "ntfy.sh", "https://ntfy.sh", "https://ntfy.example.com/", etc. and
// reduce to a bare hostname. Falls back to ntfy.sh when empty/invalid.
function normalizeNtfyServer(value) {
  const host = String(value == null ? "" : value)
    .trim()
    .replace(/^https?:\/\//i, "") // drop scheme
    .replace(/\/.*$/, "")          // drop any path/trailing slash
    .trim();
  return host || "ntfy.sh";
}

// Pure: build the https.request options + body for one push, or null if there's
// no topic to send to. Exported so the header/auth logic is unit-testable
// without making a real network call.
function buildNtfyRequest(topic, title, message, opts = {}) {
  const t = sanitizeNtfyTopic(topic);
  if (!t) return null;
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
  // Optional bearer token — turns the topic from "secret-by-obscurity" into a
  // real access-controlled channel (reading and writing require the token on a
  // server that enforces it).
  const token = String(opts.token == null ? "" : opts.token).trim();
  if (token) headers.Authorization = "Bearer " + token;
  return {
    options: {
      hostname: normalizeNtfyServer(opts.server),
      path: "/" + t,
      method: "POST",
      headers,
      timeout: 4000,
    },
    body,
  };
}

function pushNtfy(topic, title, message, opts = {}) {
  try {
    const spec = buildNtfyRequest(topic, title, message, opts);
    if (!spec) return;
    const req = https.request(spec.options, (res) => { res.resume(); });
    req.on("error", () => {});
    req.on("timeout", () => { try { req.destroy(); } catch {} });
    req.write(spec.body);
    req.end();
  } catch { /* best-effort */ }
}

module.exports = { pushNtfy, sanitizeNtfyTopic, normalizeNtfyServer, buildNtfyRequest };
