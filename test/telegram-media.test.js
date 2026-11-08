import test from "node:test";
import assert from "node:assert/strict";
import { parseMovieStorageCaption, extractMovieMedia } from "../src/lib/movie-media.js";
import { setWebhook } from "../src/lib/telegram.js";

test("parses a FINDLY storage caption with title UUID and quality", () => {
  assert.deepEqual(
    parseMovieStorageCaption("FINDLY:550e8400-e29b-41d4-a716-446655440000 | 1080p"),
    { titleId: "550e8400-e29b-41d4-a716-446655440000", quality: "1080p" }
  );
});

test("rejects storage captions without a valid movie UUID", () => {
  assert.equal(parseMovieStorageCaption("FINDLY:not-a-uuid"), null);
  assert.equal(parseMovieStorageCaption("ordinary caption"), null);
});

test("extracts video metadata from a channel post without downloading the file", () => {
  const result = extractTelegramMedia({
    message_id: 321,
    chat: { id: -1001234567890 },
    caption: "FINDLY:550e8400-e29b-41d4-a716-446655440000 | 720p",
    video: {
      file_id: "video-file-id",
      file_unique_id: "video-unique-id",
      file_size: 734003200,
      file_name: "film.mp4",
      mime_type: "video/mp4"
    }
  });
  assert.deepEqual(result, {
    chatId: "-1001234567890",
    messageId: 321,
    mediaType: "video",
    fileId: "video-file-id",
    fileUniqueId: "video-unique-id",
    fileSize: 734003200,
    fileName: "film.mp4",
    mimeType: "video/mp4",
    titleId: "550e8400-e29b-41d4-a716-446655440000",
    quality: "720p"
  });
});

test("ignores channel posts without a supported media attachment or FINDLY caption", () => {
  assert.equal(extractTelegramMedia({ message_id: 1, chat: { id: -1001 }, text: "hello" }), null);
  assert.equal(extractTelegramMedia({
    message_id: 2,
    chat: { id: -1001 },
    video: { file_id: "id", file_unique_id: "unique", file_size: 100 }
  }), null);
});

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
    assert.deepEqual(payload.allowed_updates, ["message", "callback_query", "channel_post"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
