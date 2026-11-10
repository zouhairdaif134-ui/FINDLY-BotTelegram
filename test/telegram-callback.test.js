import test from "node:test";
import assert from "node:assert/strict";
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
