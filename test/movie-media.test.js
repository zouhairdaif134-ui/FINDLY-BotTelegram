import test from "node:test";
import assert from "node:assert/strict";
import { parseMovieStorageCaption, extractTelegramMedia } from "../src/lib/movie-media.js";

test("parses a FINDLY storage caption with a title UUID and quality label", () => {
  assert.deepEqual(
    parseMovieStorageCaption("FINDLY:550e8400-e29b-41d4-a716-446655440000 | 1080p"),
    { titleId: "550e8400-e29b-41d4-a716-446655440000", title: null, releaseYear: null, quality: "1080p" }
  );
});

test("rejects malformed FINDLY storage captions", () => {
  assert.equal(parseMovieStorageCaption("FINDLY:not-a-uuid"), null);
  assert.equal(parseMovieStorageCaption("ordinary caption"), null);
  assert.deepEqual(parseMovieStorageCaption("FINDLY:Wicker (2026) | 1080p"), {
    titleId: null, title: "Wicker", releaseYear: 2026, quality: "1080p"
  });
});

test("extracts video metadata from a channel post without downloading the file", () => {
  assert.deepEqual(extractTelegramMedia({
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
  }), {
    chatId: "-1001234567890",
    messageId: 321,
    mediaType: "video",
    fileId: "video-file-id",
    fileUniqueId: "video-unique-id",
    fileSize: 734003200,
    fileName: "film.mp4",
    mimeType: "video/mp4",
    titleId: "550e8400-e29b-41d4-a716-446655440000",
    title: null,
    releaseYear: null,
    quality: "720p"
  });
});

test("ignores channel posts without a supported media attachment or matching caption", () => {
  assert.equal(extractTelegramMedia({ message_id: 1, chat: { id: -1001 }, text: "hello" }), null);
  assert.equal(extractTelegramMedia({
    message_id: 2,
    chat: { id: -1001 },
    video: { file_id: "id", file_unique_id: "unique", file_size: 100 }
  }), null);
});

import { getTelegramMediaDelivery } from "../src/lib/movie-media.js";

test("uses Telegram file_id delivery methods for stored media types", () => {
  assert.deepEqual(getTelegramMediaDelivery("video"), { method: "sendVideo", field: "video" });
  assert.deepEqual(getTelegramMediaDelivery("document"), { method: "sendDocument", field: "document" });
  assert.deepEqual(getTelegramMediaDelivery("audio"), { method: "sendAudio", field: "audio" });
  assert.deepEqual(getTelegramMediaDelivery("animation"), { method: "sendAnimation", field: "animation" });
  assert.equal(getTelegramMediaDelivery("unknown"), null);
});
