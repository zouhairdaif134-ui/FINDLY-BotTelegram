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

test("media ingestion activates uploaded assets and authorizes owner-declared distribution on upload", () => {
  assert.match(telegramRoute, /\.upsert\(\{[\s\S]*?quality_label: media\.quality,[\s\S]*?status: "active"[\s\S]*?\}\s*,\s*\{ onConflict:/);
  assert.match(telegramRoute, /تم ربط الملف بالعنوان وتفعيله تلقائياً/);
  assert.match(telegramRoute, /episode_id: linkedEpisodeId/);
  assert.match(telegramRoute, /from\("movie_seasons"\)/);
  assert.match(telegramRoute, /from\("movie_episodes"\)/);
  assert.match(telegramRoute, /from\("movie_distribution_rights"\)[\s\S]*?upsert\(\{[\s\S]*?title_id: linkedTitleId,[\s\S]*?status: "authorized"/);
  assert.doesNotMatch(telegramRoute, /metadata_status:\s*"authorized_media_available"/);
});


test("series episode caption resolves a series UUID and SxxExx coordinates", async () => {
  const { parseMovieStorageCaption, extractTelegramMedia } = await import("../src/lib/movie-media.js");
  const seriesId = "123e4567-e89b-42d3-a456-426614174000";
  assert.deepEqual(parseMovieStorageCaption(`FINDLY:${seriesId}|S01E02|1080p`), {
    titleId: seriesId, title: null, releaseYear: null, quality: "1080p",
    seasonNumber: 1, episodeNumber: 2
  });
  const media = extractTelegramMedia({
    chat: { id: -1001234567890 }, message_id: 42,
    caption: `FINDLY:${seriesId}|S02E03|720p`,
    video: { file_id: "file-id", file_unique_id: "unique-id", file_size: 123 }
  });
  assert.equal(media.seasonNumber, 2);
  assert.equal(media.episodeNumber, 3);
});

test("legacy movie storage captions remain supported", async () => {
  const { parseMovieStorageCaption } = await import("../src/lib/movie-media.js");
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.deepEqual(parseMovieStorageCaption(`FINDLY:${id}|1080p`), {
    titleId: id, title: null, releaseYear: null, quality: "1080p"
  });
});


test("Watch Bot accepts episode deep links without changing movie deep links", async () => {
  const { parseMovieStartPayload } = await import("../src/lib/movies-bot.js");
  const episodeId = "123e4567-e89b-42d3-a456-426614174000";
  assert.deepEqual(parseMovieStartPayload(`episode_${episodeId}`), {
    episodeId, action: "episode"
  });
  assert.deepEqual(parseMovieStartPayload(`movie_${episodeId}_watch`), {
    titleId: episodeId, source: null, action: "watch"
  });
});
