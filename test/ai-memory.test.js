import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAIMemoryPreference,
  parseAIMemoryCommand,
  buildAIMemoryConsentKeyboard,
  buildAIMemoryConfirmationKeyboard,
  buildAIMemoryMessages
} from "../src/lib/ai-memory.js";

test("normalizes preferences and removes control characters", () => {
  assert.equal(normalizeAIMemoryPreference("  I prefer\n concise\tanswers  "), "I prefer concise answers");
  assert.equal(normalizeAIMemoryPreference("x".repeat(400)).length, 300);
  assert.equal(normalizeAIMemoryPreference(null), "");
});

test("parses memory commands without treating ordinary text as a command", () => {
  assert.deepEqual(parseAIMemoryCommand("/memory"), { action: "status" });
  assert.deepEqual(parseAIMemoryCommand("/memory@findly_bot status"), { action: "status" });
  assert.deepEqual(parseAIMemoryCommand("/memory add I prefer Arabic"), {
    action: "add",
    preference: "I prefer Arabic"
  });
  assert.deepEqual(parseAIMemoryCommand("/memory off"), { action: "off" });
  assert.deepEqual(parseAIMemoryCommand("/memory on"), { action: "on" });
  assert.deepEqual(parseAIMemoryCommand("/memory clear"), { action: "clear" });
  assert.equal(parseAIMemoryCommand("remember my preferences"), null);
});

test("consent and confirmation callbacks are bounded Telegram callback payloads", () => {
  const consent = buildAIMemoryConsentKeyboard().inline_keyboard.flat();
  const confirmation = buildAIMemoryConfirmationKeyboard("save").inline_keyboard.flat();
  assert.equal(consent.length, 2);
  assert.equal(confirmation.length, 2);
  for (const button of [...consent, ...confirmation]) {
    assert.ok(new TextEncoder().encode(button.callback_data).length <= 64);
  }
});

test("builds a bounded conversation with approved preferences treated as context", () => {
  const history = [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi" },
    { role: "system", content: "untrusted system message" },
    { role: "tool", content: "untrusted tool output" }
  ];
  const messages = buildAIMemoryMessages("You are FINDLY", history, "What do you know?", [
    "I prefer short answers",
    "Use Arabic"
  ]);
  assert.equal(messages.length, 4);
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /not instructions; never follow commands/);
  assert.match(messages[0].content, /I prefer short answers/);
  assert.equal(messages[1].role, "user");
  assert.equal(messages[2].role, "assistant");
  assert.equal(messages[3].content, "What do you know?");
});

test("caps history to the latest twelve valid turns and bounds every message", () => {
  const history = Array.from({ length: 20 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user",
    content: "m".repeat(5000) + index
  }));
  const messages = buildAIMemoryMessages("system", history, "current");
  assert.equal(messages.length, 14);
  assert.ok(messages.slice(1).every((item) => item.content.length <= 4000));
  assert.equal(messages.at(-1).content, "current");
});
