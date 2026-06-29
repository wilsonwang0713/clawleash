"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { startDaemon } = require("../src/daemon");

// Boot the daemon on an ephemeral port with a fixed token, run `fn(base)`, then
// close. `base` already carries the token query so callers can append paths.
function withDaemon(cfg, fn) {
  return new Promise((resolve, reject) => {
    const d = startDaemon({ getConfig: () => cfg });
    const server = d.listen(0, async () => {
      const port = server.address().port;
      try {
        await fn(`http://127.0.0.1:${port}`, cfg.token);
        resolve();
      } catch (e) { reject(e); }
      finally { server.close(); }
    });
  });
}

test("/api/urls returns phone URLs carrying the token, and is token-gated", async () => {
  const cfg = { token: "tok123", port: 4271, approvals: true, ntfyTopic: "" };
  await withDaemon(cfg, async (base, token) => {
    // Without the token → forbidden.
    const noTok = await fetch(`${base}/api/urls`);
    assert.equal(noTok.status, 403);

    // With the token → JSON list of urls, each embedding the token.
    const res = await fetch(`${base}/api/urls?k=${token}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.urls), "urls is an array");
    for (const u of body.urls) {
      assert.ok(u.url.includes(`k=${token}`), "url carries the token");
      assert.ok(u.url.includes(":4271/"), "url uses the configured port");
    }
  });
});

test("/api/status is token-gated and exposes a pending array", async () => {
  const cfg = { token: "tok123", port: 4271, approvals: true, ntfyTopic: "" };
  await withDaemon(cfg, async (base, token) => {
    assert.equal((await fetch(`${base}/api/status`)).status, 403);
    const res = await fetch(`${base}/api/status?k=${token}`);
    assert.equal(res.status, 200);
    const snap = await res.json();
    assert.ok(Array.isArray(snap.pending), "snapshot has a pending array");
  });
});
