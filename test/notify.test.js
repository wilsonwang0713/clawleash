"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { sanitizeNtfyTopic } = require("../src/notify");

test("sanitizeNtfyTopic cleans to a URL-safe ntfy topic", () => {
  assert.equal(sanitizeNtfyTopic("wilson's clawd"), "wilson-s-clawd");
  assert.equal(sanitizeNtfyTopic("clawd-wilson-k7x2"), "clawd-wilson-k7x2");
  assert.equal(sanitizeNtfyTopic("  hello world!! "), "hello-world");
  assert.equal(sanitizeNtfyTopic("a_b-c"), "a_b-c");
  assert.equal(sanitizeNtfyTopic(""), "");
  assert.equal(sanitizeNtfyTopic(null), "");
  assert.equal(sanitizeNtfyTopic("x".repeat(100)).length, 64);
});
