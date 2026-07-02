"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { createRegistry, summarize, labelSuggestion, normalizeQuestions, isAnswerable, buildAnswerUpdatedInput } = require("../src/permissions");

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

// ── AskUserQuestion (remote answering) ──────────────────────────────────────

const askInput = {
  questions: [{
    header: "Approach",
    question: "Which approach should we take?",
    multiSelect: false,
    options: [
      { label: "MVP first", description: "Ship the smallest thing." },
      { label: "Full build", description: "Do it all up front." },
    ],
  }],
};

test("summarize: AskUserQuestion shows the first question", () => {
  assert.equal(summarize("AskUserQuestion", askInput), "Which approach should we take?");
  assert.equal(summarize("AskUserQuestion", {}), "Choose an option");
});

test("normalizeQuestions: exposes options with indices and clamps counts", () => {
  const qs = normalizeQuestions(askInput);
  assert.equal(qs.length, 1);
  assert.equal(qs[0].options.length, 2);
  assert.deepEqual(qs[0].options.map((o) => o.i), [0, 1]);
  assert.equal(qs[0].options[0].label, "MVP first");

  // caps: max 4 questions, 5 options each
  const big = { questions: Array.from({ length: 9 }, () => ({
    question: "q", options: Array.from({ length: 9 }, (_, i) => ({ label: "o" + i })),
  })) };
  const capped = normalizeQuestions(big);
  assert.equal(capped.length, 4);
  assert.equal(capped[0].options.length, 5);
});

// Multi-question, multi-select input for the clawd-on-desk-style form.
const multiInput = {
  questions: [
    { header: "Approach", question: "Which approach?", multiSelect: false,
      options: [{ label: "MVP first" }, { label: "Full build" }] },
    { header: "Scope", question: "Which areas?", multiSelect: true,
      options: [{ label: "API" }, { label: "UI" }, { label: "Docs" }] },
  ],
};

test("isAnswerable: any elicitation with options (single/multi select, one/many questions)", () => {
  assert.equal(isAnswerable(normalizeQuestions(askInput)), true);
  // multi-select is now answerable
  assert.equal(isAnswerable(normalizeQuestions({ questions: [{ question: "q", multiSelect: true, options: [{ label: "a" }] }] })), true);
  // multiple questions are now answerable
  assert.equal(isAnswerable(normalizeQuestions(multiInput)), true);
  // a question with no options is not
  assert.equal(isAnswerable(normalizeQuestions({ questions: [{ question: "q", options: [] }] })), false);
  // if ANY question lacks options, not answerable
  assert.equal(isAnswerable(normalizeQuestions({ questions: [askInput.questions[0], { question: "q2", options: [] }] })), false);
});

test("buildAnswerUpdatedInput: folds picked labels into answers by question text", () => {
  const updated = buildAnswerUpdatedInput(askInput, { "Which approach should we take?": "MVP first" });
  assert.equal(updated.answers["Which approach should we take?"], "MVP first");
  assert.deepEqual(updated.questions, askInput.questions); // questions preserved
});

test("registry: AskUserQuestion lists questions + answerable, resolves via answers map", async () => {
  const reg = createRegistry();
  let id = null;
  const p = reg.request({ tool: "AskUserQuestion", input: askInput, sessionId: "s" }, 5000, (info) => { id = info.id; });

  const item = reg.list()[0];
  assert.equal(item.tool, "AskUserQuestion");
  assert.equal(item.answerable, true);
  assert.equal(item.questions[0].options.length, 2);

  // submitting the answers map settles allow + updatedInput carrying the label
  assert.equal(reg.resolve(id, { answers: { "Which approach should we take?": "Full build" } }), true);
  const decision = await p;
  assert.equal(decision.decision, "allow");
  assert.equal(decision.updatedInput.answers["Which approach should we take?"], "Full build");
});

test("registry: multi-question requires every question answered, multi-select joined", async () => {
  const reg = createRegistry();
  let id = null;
  const p = reg.request({ tool: "AskUserQuestion", input: multiInput, sessionId: "s" }, 5000, (info) => { id = info.id; });
  assert.equal(reg.list()[0].answerable, true);

  // partial answers (only 1 of 2 questions) → no-op, still pending
  assert.equal(reg.resolve(id, { answers: { "Which approach?": "MVP first" } }), false);
  assert.equal(reg.size(), 1);

  // all answered (multi-select joined with ", ") → allow
  assert.equal(reg.resolve(id, { answers: { "Which approach?": "MVP first", "Which areas?": "API, UI" } }), true);
  const decision = await p;
  assert.equal(decision.decision, "allow");
  assert.equal(decision.updatedInput.answers["Which areas?"], "API, UI");
});

test("ExitPlanMode: summarize + list expose the plan; approve resolves allow", async () => {
  const planInput = { plan: "1. Do X\n2. Do Y\n3. Ship it" };
  assert.equal(summarize("ExitPlanMode", planInput), "1. Do X 2. Do Y 3. Ship it");
  assert.equal(summarize("ExitPlanMode", {}), "Review plan");

  const reg = createRegistry();
  let id = null;
  const p = reg.request({ tool: "ExitPlanMode", input: planInput, sessionId: "s" }, 5000, (info) => { id = info.id; });
  const item = reg.list()[0];
  assert.equal(item.tool, "ExitPlanMode");
  assert.match(item.plan, /Do X/);
  assert.equal(item.answerable, false); // not an AskUserQuestion form

  assert.equal(reg.resolve(id, "allow"), true); // Approve
  const decision = await p;
  assert.equal(decision.decision, "allow");
});

test("registry: answering a question without options is a no-op", () => {
  const reg = createRegistry();
  let id = null;
  reg.request({ tool: "AskUserQuestion", input: { questions: [{ question: "q", options: [] }] }, sessionId: "s" }, 5000, (info) => { id = info.id; });
  assert.equal(reg.list()[0].answerable, false);
  assert.equal(reg.resolve(id, { answers: { q: "x" } }), false);
  assert.equal(reg.size(), 1); // still pending
});
