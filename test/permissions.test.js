"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { createRegistry, summarize } = require("../src/permissions");

test("summarize maps tools to readable text", () => {
  assert.equal(summarize("Bash", { command: "rm -rf build" }), "rm -rf build");
  assert.equal(summarize("Write", { file_path: "/a/b/main.js" }), "Write main.js");
  assert.equal(summarize("WebFetch", { url: "https://example.com" }), "https://example.com");
  assert.equal(summarize("Glob", {}), "Glob");
});

test("registry: request appears in list and resolves to a decision", async () => {
  const reg = createRegistry();
  let pendingId = null;
  const p = reg.request({ tool: "Bash", input: { command: "echo hi" }, sessionId: "s1" }, 5000, (info) => { pendingId = info.id; });

  // listed while pending
  const list = reg.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].summary, "echo hi");
  assert.equal(list[0].id, pendingId);
  assert.equal(reg.size(), 1);

  // bad id is a no-op; correct id resolves
  assert.equal(reg.resolve("nope", "allow"), false);
  assert.equal(reg.resolve(pendingId, "deny"), true);

  const decision = await p;
  assert.equal(decision.decision, "deny");
  assert.equal(decision.message, "Denied from phone");
  assert.equal(reg.size(), 0);
  // resolving again is a no-op
  assert.equal(reg.resolve(pendingId, "allow"), false);
});

test("registry: timeout settles as 'timeout'", async () => {
  const reg = createRegistry();
  const decision = await reg.request({ tool: "Bash", input: {}, sessionId: "s" }, 20);
  assert.equal(decision.decision, "timeout");
  assert.equal(reg.size(), 0);
});
