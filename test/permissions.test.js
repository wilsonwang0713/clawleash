"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { createRegistry, summarize, labelSuggestion } = require("../src/permissions");

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

test("labelSuggestion describes an addRules suggestion", () => {
  assert.match(
    labelSuggestion({ type: "addRules", behavior: "allow", rules: [{ toolName: "Bash", ruleContent: "npm test" }] }),
    /Always allow .*npm test/,
  );
  assert.match(labelSuggestion({ type: "addRules", behavior: "deny", rules: [] }), /Always deny/);
  assert.equal(labelSuggestion({ title: "Allow for this session" }), "Allow for this session");
});

test("registry: a suggestion choice resolves with updatedPermissions", async () => {
  const reg = createRegistry();
  const suggestion = { type: "addRules", behavior: "allow", rules: [{ toolName: "Bash", ruleContent: "npm test" }] };
  let id = null;
  const p = reg.request(
    { tool: "Bash", input: { command: "npm test" }, sessionId: "s", suggestions: [suggestion] },
    5000,
    (info) => { id = info.id; },
  );

  // suggestions are exposed in the list with an index + label
  const item = reg.list()[0];
  assert.equal(item.suggestions.length, 1);
  assert.equal(item.suggestions[0].i, 0);
  assert.match(item.suggestions[0].label, /Always allow/);

  // picking suggestion 0 settles allow + carries updatedPermissions
  assert.equal(reg.resolve(id, { suggestion: 0 }), true);
  const decision = await p;
  assert.equal(decision.decision, "allow");
  assert.deepEqual(decision.updatedPermissions, [suggestion]);
});

test("registry: an out-of-range suggestion index is a no-op", () => {
  const reg = createRegistry();
  let id = null;
  reg.request({ tool: "Bash", input: {}, sessionId: "s", suggestions: [] }, 5000, (info) => { id = info.id; });
  assert.equal(reg.resolve(id, { suggestion: 3 }), false);
  assert.equal(reg.size(), 1); // still pending
});

test("registry: timeout settles as 'timeout'", async () => {
  const reg = createRegistry();
  const decision = await reg.request({ tool: "Bash", input: {}, sessionId: "s" }, 20);
  assert.equal(decision.decision, "timeout");
  assert.equal(reg.size(), 0);
});
