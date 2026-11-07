import test from "node:test";
import assert from "node:assert/strict";

test("classifyAIError returns safe categories without exposing provider or user text", async () => {
  const { classifyAIError } = await import("../src/lib/ai.js");
  assert.equal(typeof classifyAIError, "function");
  assert.deepEqual(classifyAIError(new Error("AI provider is not configured")), {
    category: "provider_missing"
  });
  assert.deepEqual(classifyAIError(new Error("AI provider request failed with status 429")), {
    category: "rate_limited"
  });
  assert.deepEqual(classifyAIError(new Error("AI provider request failed with status 503")), {
    category: "provider_unavailable"
  });
  assert.deepEqual(classifyAIError(Object.assign(new Error("request aborted"), { name: "AbortError" })), {
    category: "timeout"
  });
  assert.deepEqual(classifyAIError(new Error("private prompt: find me a film about my family")), {
    category: "internal_error"
  });
  assert.deepEqual(classifyAIError(new Error("private prompt: do not store this")), {
    category: "internal_error"
  });
});


test("AI telemetry failures never escape into the Telegram reply path", async () => {
  const { recordAIAnalyticsBestEffort } = await import("../src/lib/ai.js");
  const calls = [];
  const failed = await recordAIAnalyticsBestEffort(async (...args) => {
    calls.push(args);
    throw new Error("database unavailable");
  }, { marker: "env" }, { id: "bot-id" }, "ai_error", { category: "provider_unavailable" });
  assert.equal(failed, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2], null);
  assert.equal(calls[0][3], "ai_error");

  const succeeded = await recordAIAnalyticsBestEffort(async (...args) => {
    calls.push(args);
  }, { marker: "env" }, { id: "bot-id" }, "ai_message", { duration_ms: 12 });
  assert.equal(succeeded, true);
});
