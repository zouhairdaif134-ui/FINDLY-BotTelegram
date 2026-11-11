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

test("media ingestion activates uploaded assets immediately without changing distribution rights", () => {
  assert.match(telegramRoute, /\.upsert\(\{[\s\S]*?quality_label: media\.quality,[\s\S]*?status: "active"[\s\S]*?\}\s*,\s*\{ onConflict:/);
  assert.match(telegramRoute, /تم ربط الملف بالعنوان وتفعيله تلقائياً/);
  assert.doesNotMatch(telegramRoute, /distribution_rights_status:\s*"authorized"/);
  assert.doesNotMatch(telegramRoute, /metadata_status:\s*"authorized_media_available"/);
});
