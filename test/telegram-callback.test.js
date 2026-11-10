import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { answerCallback } from "../src/lib/telegram.js";

test("answerCallback ignores Telegram's expired callback-query response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    ok: false,
    description: "Bad Request: query is too old and response timeout expired or query ID is invalid"
  }, { status: 400 });
  try {
    await assert.doesNotReject(
      answerCallback({ TELEGRAM_BOT_TOKENS: '{"findly":"test-token"}' }, "findly", "expired-query-id")
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("answerCallback still surfaces unrelated Telegram API failures", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    ok: false,
    description: "Unauthorized"
  }, { status: 401 });
  try {
    await assert.rejects(
      answerCallback({ TELEGRAM_BOT_TOKENS: '{"findly":"test-token"}' }, "findly", "query-id"),
      /Unauthorized/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("callback acknowledgement is centralized in the Telegram update entry point", () => {
  const route = readFileSync(new URL("../src/routes/telegram.js", import.meta.url), "utf8");
  const movieHandlers = readFileSync(new URL("../src/lib/movies-bot.js", import.meta.url), "utf8");
  const jobsHandlers = readFileSync(new URL("../src/lib/jobs-ui.js", import.meta.url), "utf8");
  const routeCalls = route.match(/answerCallback\(/g) || [];
  assert.equal(routeCalls.length, 1, "only handleTelegramUpdate should acknowledge callback queries");
  assert.doesNotMatch(movieHandlers, /answerCallback\(/, "movie handlers must not acknowledge a second time");
  assert.doesNotMatch(jobsHandlers, /answerCallback\(/, "jobs handlers must not acknowledge a second time");
});
