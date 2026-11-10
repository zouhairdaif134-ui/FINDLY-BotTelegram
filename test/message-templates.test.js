import test from "node:test";
import assert from "node:assert/strict";
import { validateMessageTemplate, renderMessageTemplate, validateMessageButtons } from "../src/routes/message-templates.js";

test("message templates accept allowlisted placeholders and Telegram HTML", () => {
  const value = validateMessageTemplate("findly", "start", "<b>{bot_name}</b>\\n{welcome_text}");
  assert.equal(value, "<b>{bot_name}</b>\\n{welcome_text}");
});

test("message templates reject unknown placeholders", () => {
  assert.throws(() => validateMessageTemplate("findly", "start", "Hello {user_token}"), /Unsupported placeholder/);
});

test("message templates reject unsupported HTML tags and attributes", () => {
  assert.throws(() => validateMessageTemplate("movies", "help", "<script>alert(1)</script>"), /formatting tags/);
  assert.throws(() => validateMessageTemplate("movies", "help", "<b onclick=\"x\">Help</b>"), /attributes/);
});

test("message templates enforce length and non-empty text", () => {
  assert.throws(() => validateMessageTemplate("findly", "help", " "), /1 to 1800/);
  assert.throws(() => validateMessageTemplate("findly", "help", "x".repeat(1801)), /1 to 1800/);
});

test("template renderer escapes dynamic values", () => {
  assert.equal(renderMessageTemplate("<b>{bot_name}</b>", { bot_name: "<Admin & Bot>" }), "<b>&lt;Admin &amp; Bot&gt;</b>");
});

test("inline buttons accept only unique predefined actions for each bot", () => {
  assert.deepEqual(validateMessageButtons("findly", ["movies", "search"]), ["movies", "search"]);
  assert.throws(() => validateMessageButtons("findly", ["watch:raw_callback"]), /predefined actions/);
  assert.throws(() => validateMessageButtons("movies", ["search", "search"]), /predefined actions/);
  assert.throws(() => validateMessageButtons("movies", Array(9).fill("search")), /predefined actions/);
});
