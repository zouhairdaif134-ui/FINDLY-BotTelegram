import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const telegramRoute = readFileSync(
  new URL("../src/routes/telegram.js", import.meta.url),
  "utf8"
);

test("media ingestion is limited to the configured active storage channel", () => {
  assert.match(telegramRoute, /from\("movie_media_storage_config"\)/);
  assert.match(telegramRoute, /isActiveMovieStorageChannel\(media\.chatId, storageConfig\?\.active_storage_chat_id\)/);
});

test("media ingestion relies on the pending_review database default and never marks rights authorized", () => {
  assert.match(telegramRoute, /\.upsert\(\{[\s\S]*?quality_label: media\.quality[\s\S]*?\}\s*,\s*\{ onConflict:/);
  assert.doesNotMatch(telegramRoute, /status:\s*"active"/);
  assert.doesNotMatch(telegramRoute, /metadata_status:\s*"authorized_media_available"/);
});
