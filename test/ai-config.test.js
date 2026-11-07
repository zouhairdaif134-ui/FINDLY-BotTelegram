import test from "node:test";
import assert from "node:assert/strict";
import * as ai from "../src/lib/ai.js";

test("exports a pure AI configuration normalizer", () => {
  assert.equal(typeof ai.normalizeAIConfig, "function");
});

test("keeps AI disabled by default and applies bounded defaults", () => {
  const config = ai.normalizeAIConfig({}, {});
  assert.equal(config.enabled, false);
  assert.equal(config.model, "@cf/qwen/qwen3.8-27b");
  assert.equal(config.apiUrl, "https://api.openai.com/v1/chat/completions");
  assert.equal(config.temperature, 0.7);
  assert.equal(config.maxTokens, 700);
  assert.equal(config.timeoutMs, 15000);
});

test("normalizes valid per-bot settings and clamps unsafe numeric limits", () => {
  const config = ai.normalizeAIConfig({
    enabled: true,
    model: "custom-model",
    api_url: "https://api.example.com/v1/chat/completions",
    system_prompt: "  Be concise.  ",
    temperature: 9,
    max_tokens: 9000,
    timeout_ms: 60000
  }, { AI_ALLOWED_HOSTS: "api.example.com" });
  assert.equal(config.enabled, true);
  assert.equal(config.model, "custom-model");
  assert.equal(config.apiUrl, "https://api.example.com/v1/chat/completions");
  assert.equal(config.systemPrompt, "Be concise.");
  assert.equal(config.temperature, 2);
  assert.equal(config.maxTokens, 2000);
  assert.equal(config.timeoutMs, 30000);
});

test("rejects insecure or local provider endpoints by falling back safely", () => {
  for (const apiUrl of [
    "http://provider.example/v1/chat/completions",
    "https://localhost/v1/chat/completions",
    "https://127.0.0.1/v1/chat/completions",
    "https://user:pass@provider.example/v1/chat/completions",
    "javascript:alert(1)"
  ]) {
    const config = ai.normalizeAIConfig({ enabled: true, api_url: apiUrl }, {});
    assert.equal(config.apiUrl, "https://api.openai.com/v1/chat/completions", apiUrl);
  }
});

test("uses environment defaults only when a bot setting is absent", () => {
  const config = ai.normalizeAIConfig({}, {
    AI_MODEL: "env-model",
    AI_API_URL: "https://env-provider.example/chat",
    AI_ALLOWED_HOSTS: "env-provider.example"
  });
  assert.equal(config.model, "env-model");
  assert.equal(config.apiUrl, "https://env-provider.example/chat");
});

test("rejects arbitrary public provider hosts unless explicitly allowlisted", () => {
  const blocked = ai.normalizeAIConfig({
    enabled: true,
    api_url: "https://untrusted.example/v1/chat/completions"
  }, {});
  assert.equal(blocked.apiUrl, "https://api.openai.com/v1/chat/completions");

  const allowed = ai.normalizeAIConfig({
    enabled: true,
    api_url: "https://trusted.example/v1/chat/completions"
  }, { AI_ALLOWED_HOSTS: "trusted.example" });
  assert.equal(allowed.apiUrl, "https://trusted.example/v1/chat/completions");
});
