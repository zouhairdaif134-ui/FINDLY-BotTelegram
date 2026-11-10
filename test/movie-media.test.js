import test from "node:test";
import assert from "node:assert/strict";
import { parseMovieStorageCaption, extractTelegramMedia, resolveMovieMediaTitleId, normalizeMovieTitle, findMovieMediaTitle } from "../src/lib/movie-media.js";

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
    videoWidth: null,
    videoHeight: null,
    durationSeconds: null,
    titleId: "550e8400-e29b-41d4-a716-446655440000",
    title: null,
    releaseYear: null,
    quality: "720p"
  });
});

test("extracts Telegram video dimensions and duration for playback diagnostics", () => {
  const media = extractTelegramMedia({
    message_id: 322,
    chat: { id: -1001234567890 },
    caption: "FINDLY:550e8400-e29b-41d4-a716-446655440000 | 1080p",
    video: {
      file_id: "video-file-id",
      file_unique_id: "video-unique-id",
      file_size: 734003200,
      mime_type: "video/mp4",
      width: 1920,
      height: 1080,
      duration: 7200
    }
  });
  assert.equal(media.videoWidth, 1920);
  assert.equal(media.videoHeight, 1080);
  assert.equal(media.durationSeconds, 7200);
});

test("does not invent video metadata when Telegram omits dimensions or duration", () => {
  const media = extractTelegramMedia({
    message_id: 323,
    chat: { id: -1001234567890 },
    caption: "FINDLY:550e8400-e29b-41d4-a716-446655440000 | Original",
    video: { file_id: "video-file-id", file_unique_id: "video-unique-id" }
  });
  assert.equal(media.videoWidth, null);
  assert.equal(media.videoHeight, null);
  assert.equal(media.durationSeconds, null);
});

test("ignores channel posts without a supported media attachment or matching caption", () => {
  assert.equal(extractTelegramMedia({ message_id: 1, chat: { id: -1001 }, text: "hello" }), null);
  assert.equal(extractTelegramMedia({
    message_id: 2,
    chat: { id: -1001 },
    video: { file_id: "id", file_unique_id: "unique", file_size: 100 }
  }), null);
});

import { getTelegramMediaDelivery, canDistributeMovieMedia, isActiveMovieStorageChannel, isAllowedMovieMediaStatusTransition, canApproveMovieMediaAsset } from "../src/lib/movie-media.js";

test("uses Telegram file_id delivery methods for stored media types", () => {
  assert.deepEqual(getTelegramMediaDelivery("video"), { method: "sendVideo", field: "video" });
  assert.deepEqual(getTelegramMediaDelivery("document"), { method: "sendDocument", field: "document" });
  assert.deepEqual(getTelegramMediaDelivery("audio"), { method: "sendAudio", field: "audio" });
  assert.deepEqual(getTelegramMediaDelivery("animation"), { method: "sendAnimation", field: "animation" });
  assert.equal(getTelegramMediaDelivery("unknown"), null);
});


test("resolves title-based media links to the matched database title ID", () => {
  const media = { titleId: null, title: "Tetris", releaseYear: 2023 };
  const title = { id: "b3a8db5f-16f2-43e9-81cf-176db3834374", title: "Tetris" };
  assert.equal(resolveMovieMediaTitleId(media, title), title.id);
});

test("preserves UUID-based media links when resolving the title ID", () => {
  const media = { titleId: "550e8400-e29b-41d4-a716-446655440000" };
  assert.equal(resolveMovieMediaTitleId(media, null), media.titleId);
});

test("matches storage captions to catalog titles without case or punctuation sensitivity", () => {
  const media = { title: "Day Of Reckoning", releaseYear: 2025 };
  const catalogTitle = { id: "f4a20a18-3f42-4d3c-9e87-12d3a4567890", title: "Day of Reckoning", release_year: 2025 };
  assert.equal(normalizeMovieTitle(media.title), normalizeMovieTitle(catalogTitle.title));
  assert.equal(findMovieMediaTitle([catalogTitle], media), catalogTitle);
});

test("does not link a media caption when the year differs or the match is ambiguous", () => {
  const media = { title: "Day Of Reckoning", releaseYear: 2025 };
  const wrongYear = { id: "f4a20a18-3f42-4d3c-9e87-12d3a4567890", title: "Day of Reckoning", release_year: 2024 };
  const duplicate = { id: "a4a20a18-3f42-4d3c-9e87-12d3a4567891", title: "DAY OF RECKONING", release_year: 2025 };
  assert.equal(findMovieMediaTitle([wrongYear], media), null);
  assert.equal(findMovieMediaTitle([
    { ...wrongYear, release_year: 2025 }, duplicate
  ], media), null);
});

test("distribution rights must be explicitly authorized before media delivery", () => {
  assert.equal(canDistributeMovieMedia("authorized"), true);
  assert.equal(canDistributeMovieMedia("unverified"), false);
  assert.equal(canDistributeMovieMedia("not_authorized"), false);
  assert.equal(canDistributeMovieMedia(null), false);
});

test("only the configured active Telegram channel can ingest new media", () => {
  assert.equal(isActiveMovieStorageChannel("-1001234567890", "-1001234567890"), true);
  assert.equal(isActiveMovieStorageChannel("-1001234567890", "-1009999999999"), false);
  assert.equal(isActiveMovieStorageChannel("-1001234567890", null), false);
  assert.equal(isActiveMovieStorageChannel("-1001234567890", ""), false);
});

test("media review permits only pending approval or rejection and active deactivation", () => {
  assert.equal(isAllowedMovieMediaStatusTransition("pending_review", "active"), true);
  assert.equal(isAllowedMovieMediaStatusTransition("pending_review", "rejected"), true);
  assert.equal(isAllowedMovieMediaStatusTransition("active", "inactive"), true);
  assert.equal(isAllowedMovieMediaStatusTransition("active", "rejected"), false);
  assert.equal(isAllowedMovieMediaStatusTransition("inactive", "active"), false);
  assert.equal(isAllowedMovieMediaStatusTransition("rejected", "active"), false);
  assert.equal(isAllowedMovieMediaStatusTransition("unknown", "active"), false);
});


test("only Telegram video posts can be approved for in-chat movie playback", () => {
  assert.equal(canApproveMovieMediaAsset({ media_type: "video" }), true);
  assert.equal(canApproveMovieMediaAsset({ media_type: "document", mime_type: "video/mp4" }), false);
  assert.equal(canApproveMovieMediaAsset({ media_type: "audio" }), false);
  assert.equal(canApproveMovieMediaAsset({ media_type: "animation" }), false);
  assert.equal(canApproveMovieMediaAsset(null), false);
});
