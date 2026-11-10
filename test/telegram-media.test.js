import test from "node:test";
import assert from "node:assert/strict";
import { setWebhook } from "../src/lib/telegram.js";

test("webhook subscribes to channel_post updates while preserving existing update types", async () => {
  const originalFetch = globalThis.fetch;
  let payload;
  globalThis.fetch = async (_url, options = {}) => {
    payload = JSON.parse(options.body);
    return Response.json({ ok: true, result: true });
  };
  try {
    await setWebhook({
      TELEGRAM_MOVIES_BOT_TOKEN: "test-token",
      TELEGRAM_MOVIES_WEBHOOK_SECRET: "test-secret"
    }, "movies", "https://example.com/telegram/movies");
    assert.deepEqual(payload.allowed_updates, ["message", "callback_query", "channel_post", "edited_channel_post"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

