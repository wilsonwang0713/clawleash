"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const {
  sanitizeNtfyTopic, normalizeNtfyServer, buildNtfyRequest,
  normalizeBarkServer, buildBarkRequest,
} = require("../src/notify");

test("sanitizeNtfyTopic cleans to a URL-safe ntfy topic", () => {
  assert.equal(sanitizeNtfyTopic("wilson's clawd"), "wilson-s-clawd");
  assert.equal(sanitizeNtfyTopic("clawd-wilson-k7x2"), "clawd-wilson-k7x2");
  assert.equal(sanitizeNtfyTopic("  hello world!! "), "hello-world");
  assert.equal(sanitizeNtfyTopic("a_b-c"), "a_b-c");
  assert.equal(sanitizeNtfyTopic(""), "");
  assert.equal(sanitizeNtfyTopic(null), "");
  assert.equal(sanitizeNtfyTopic("x".repeat(100)).length, 64);
});

test("normalizeNtfyServer reduces to a bare hostname, defaulting to ntfy.sh", () => {
  assert.equal(normalizeNtfyServer(""), "ntfy.sh");
  assert.equal(normalizeNtfyServer(null), "ntfy.sh");
  assert.equal(normalizeNtfyServer("ntfy.sh"), "ntfy.sh");
  assert.equal(normalizeNtfyServer("https://ntfy.sh"), "ntfy.sh");
  assert.equal(normalizeNtfyServer("https://ntfy.example.com/"), "ntfy.example.com");
  assert.equal(normalizeNtfyServer("http://ntfy.example.com/path/extra"), "ntfy.example.com");
  assert.equal(normalizeNtfyServer("  ntfy.example.com  "), "ntfy.example.com");
});

test("buildNtfyRequest returns null when there is no topic", () => {
  assert.equal(buildNtfyRequest("", "t", "m"), null);
  assert.equal(buildNtfyRequest("   ", "t", "m"), null);
});

test("buildNtfyRequest targets the topic on the default server", () => {
  const spec = buildNtfyRequest("my-topic", "Hi", "body");
  assert.equal(spec.options.hostname, "ntfy.sh");
  assert.equal(spec.options.path, "/my-topic");
  assert.equal(spec.options.method, "POST");
  assert.equal(spec.options.headers.Title, "Hi");
  assert.equal(spec.body.toString("utf8"), "body");
  // No token → no Authorization header.
  assert.equal(spec.options.headers.Authorization, undefined);
});

test("buildNtfyRequest adds a bearer token and honours a custom server", () => {
  const spec = buildNtfyRequest("my-topic", "Hi", "body", {
    token: "tk_secret123",
    server: "https://ntfy.example.com/",
  });
  assert.equal(spec.options.headers.Authorization, "Bearer tk_secret123");
  assert.equal(spec.options.hostname, "ntfy.example.com");
});

test("buildNtfyRequest strips non-ASCII from the Title but keeps the UTF-8 body", () => {
  const spec = buildNtfyRequest("t", "權限 needed 🦀", "中文內容");
  assert.match(spec.options.headers.Title, /needed/);
  assert.doesNotMatch(spec.options.headers.Title, /[^\x20-\x7E]/);
  assert.equal(spec.body.toString("utf8"), "中文內容");
});

test("normalizeBarkServer reduces to a hostname, defaulting to api.day.app", () => {
  assert.equal(normalizeBarkServer(""), "api.day.app");
  assert.equal(normalizeBarkServer("https://api.day.app/"), "api.day.app");
  assert.equal(normalizeBarkServer("bark.example.com"), "bark.example.com");
});

test("buildBarkRequest returns null without a device key", () => {
  assert.equal(buildBarkRequest("", "t", "m"), null);
  assert.equal(buildBarkRequest("   ", "t", "m"), null);
});

test("buildBarkRequest posts a JSON body (title/body/icon) to /<key>", () => {
  const spec = buildBarkRequest("KEY123", "Permission needed", "Bash: rm -rf", {
    icon: "https://example.com/crab.png",
  });
  assert.equal(spec.options.hostname, "api.day.app");
  assert.equal(spec.options.path, "/KEY123");
  assert.equal(spec.options.method, "POST");
  assert.match(spec.options.headers["Content-Type"], /application\/json/);
  const j = JSON.parse(spec.body.toString("utf8"));
  assert.equal(j.title, "Permission needed");
  assert.equal(j.body, "Bash: rm -rf");
  assert.equal(j.icon, "https://example.com/crab.png");
  assert.equal(j.group, "clawleash");
});

test("buildBarkRequest keeps UTF-8 (Chinese + emoji) in the JSON body", () => {
  const spec = buildBarkRequest("KEY", "權限請求", "寫入 Glass.swift 🦀");
  const j = JSON.parse(spec.body.toString("utf8"));
  assert.equal(j.title, "權限請求");
  assert.equal(j.body, "寫入 Glass.swift 🦀");
});
