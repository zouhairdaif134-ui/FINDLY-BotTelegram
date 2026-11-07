import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAIAdminInput } from "../src/routes/ai.js";

test("accepts safe AI settings and stores no provider credentials", () => {
  const { normalized, stored } = normalizeAIAdminInput({
    enabled: true,
    model: "gpt-4o-mini",
    api_url: "https://api.openai.com/v1/chat/completions",
    system_prompt: "Be concise",
    temperature: 1.2,
    max_tokens: 900,
    timeout_ms: 12000
  }, { AI_API_KEY: "never-return-this" });

  assert.equal(normalized.enabled, true);
  assert.equal(stored.enabled, true);
  assert.equal(Object.keys(stored).some((key) => /api.?key|secret|password|access.?token|refresh.?token/i.test(key)), false);
  assert.equal(JSON.stringify({ normalized, stored }).includes("never-return-this"), false);
});

test("rejects attempts to save API keys or other secret fields", () => {
  assert.throws(
    () => normalizeAIAdminInput({ enabled: true, api_key: "private" }, {}),
    /credentials cannot be saved/
  );
  assert.throws(
    () => normalizeAIAdminInput({ provider_secret: "private" }, {}),
    /credentials cannot be saved/
  );
});

test("rejects unsupported fields and malformed numeric values", () => {
  assert.throws(
    () => normalizeAIAdminInput({ arbitrary_sql: "DROP TABLE" }, {}),
    /Unsupported AI configuration field/
  );
  assert.throws(
    () => normalizeAIAdminInput({ temperature: "1" }, {}),
    /temperature must be a finite number/
  );
  assert.throws(
    () => normalizeAIAdminInput({ max_tokens: 0 }, {}),
    /max_tokens must be a positive integer/
  );
});

test("rejects provider endpoints outside the owner allowlist", () => {
  assert.throws(
    () => normalizeAIAdminInput({
      api_url: "https://attacker.example/v1/chat/completions"
    }, {}),
    /Provider URL is not allowed/
  );
});

test("clamps numeric values before storing dashboard configuration", () => {
  const { stored } = normalizeAIAdminInput({
    temperature: 4,
    max_tokens: 5000,
    timeout_ms: 90000
  }, {});
  assert.equal(stored.temperature, 2);
  assert.equal(stored.max_tokens, 2000);
  assert.equal(stored.timeout_ms, 30000);
});


test("recognizes the native Workers AI binding without requiring an API secret", () => {
  const { normalized } = normalizeAIAdminInput({
    enabled: true,
    model: "@cf/qwen/qwen3.8-27b"
  }, { AI: { run() {} } });
  assert.equal(normalized.enabled, true);
});
