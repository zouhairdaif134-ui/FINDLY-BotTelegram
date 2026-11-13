import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMovieSearch,
  parseMoviesCallback,
  isMoviesSearchReply,
  isMoviesYearReply,
  MOVIE_PAGE_SIZE
} from "./movies-bot.js";
import { getTelegramToken, getTelegramWebhookSecret } from "./telegram.js";

test("normalizes and bounds movie search input", () => {
  assert.equal(normalizeMovieSearch("  Dune  "), "Dune");
  assert.equal(normalizeMovieSearch("A\u0000B"), "AB");
  assert.equal(normalizeMovieSearch("x".repeat(100)).length, 80);
});

test("parses only valid Movies callbacks", () => {
  assert.deepEqual(parseMoviesCallback("movies:new:2"), { action: "new", page: 2 });
  assert.deepEqual(parseMoviesCallback("movies:title:550e8400-e29b-41d4-a716-446655440000"), {
    action: "title", id: "550e8400-e29b-41d4-a716-446655440000"
  });
  assert.equal(parseMoviesCallback("master:new:0"), null);
  assert.equal(parseMoviesCallback("movies:title:not-a-uuid"), null);
  assert.deepEqual(parseMoviesCallback("movies:new:-1"), { action: "new", page: 0 });
});

test("parses Library and Categories navigation callbacks", () => {
  assert.deepEqual(parseMoviesCallback("movies:library:0"), { action: "library", page: 0 });
  assert.deepEqual(parseMoviesCallback("movies:categories"), { action: "categories", page: 0 });
  assert.deepEqual(parseMoviesCallback("movies:genre:science-fiction:2"), {
    action: "genre", genreSlug: "science-fiction", page: 2
  });
  assert.deepEqual(parseMoviesCallback("movies:added:1"), { action: "added", page: 1 });
  assert.deepEqual(parseMoviesCallback("movies:old:1"), { action: "old", page: 1 });
  assert.deepEqual(parseMoviesCallback("movies:az:0"), { action: "az", page: 0 });
  assert.deepEqual(parseMoviesCallback("movies:year:2024:0"), {
    action: "year", year: 2024, page: 0
  });
  assert.equal(parseMoviesCallback("movies:genre:bad_slug:0"), null);
});

test("uses ten titles per Telegram library page", () => {
  assert.equal(MOVIE_PAGE_SIZE, 10);
});

test("parses compact combined library filters and keeps page state", () => {
  assert.deepEqual(parseMoviesCallback("movies:filter:movie:action:2026:top:2"), {
    action: "filter", mediaType: "movie", genreSlug: "action", year: 2026, sort: "top", page: 2
  });
  assert.deepEqual(parseMoviesCallback("movies:filter:all:none:0:added:0"), {
    action: "filter", mediaType: "all", genreSlug: "", year: null, sort: "added", page: 0
  });
  assert.equal(parseMoviesCallback("movies:filter:movie:bad_slug:2026:top:0"), null);
  assert.deepEqual(parseMoviesCallback("movies:filters"), { action: "filters" });
  assert.deepEqual(parseMoviesCallback("movies:filters:movie:action:2026:top"), {
    action: "filters", mediaType: "movie", genreSlug: "action", year: 2026, sort: "top"
  });
  assert.deepEqual(parseMoviesCallback("movies:filtergenres:movie:action:2026:top"), {
    action: "filtergenres", mediaType: "movie", genreSlug: "action", year: 2026, sort: "top"
  });
  assert.deepEqual(parseMoviesCallback("movies:filteryearprompt:series:drama:2025:az"), {
    action: "filteryearprompt", mediaType: "series", genreSlug: "drama", year: 2025, sort: "az"
  });
});

test("recognizes only replies to the Movies search prompt", () => {
  assert.equal(isMoviesSearchReply({ reply_to_message: { text: "🔎 بحث FINDLY Movies\n..." } }), true);
  assert.equal(isMoviesSearchReply({ reply_to_message: { text: "unrelated" } }), false);
  assert.equal(isMoviesSearchReply({}), false);
});

test("recognizes only replies to the movie release-year prompt", () => {
  assert.equal(isMoviesYearReply({ reply_to_message: { text: "📅 سنة إصدار FINDLY\n..." } }), true);
  assert.equal(isMoviesYearReply({ reply_to_message: { text: "unrelated" } }), false);
});

test("Movies token is isolated and never falls back to Master token map", () => {
  assert.throws(
    () => getTelegramToken({ TELEGRAM_BOT_TOKENS: JSON.stringify({ findly: "MASTER_SECRET" }) }, "movies"),
    (error) => error.code === "TELEGRAM_CONFIG_ERROR"
  );
  assert.equal(
    getTelegramToken({ TELEGRAM_MOVIES_BOT_TOKEN: "MOVIES_SECRET" }, "movies"),
    "MOVIES_SECRET"
  );
  assert.equal(
    getTelegramToken({ TELEGRAM_BOT_TOKENS: JSON.stringify({ findly: "MASTER_SECRET" }) }, "findly"),
    "MASTER_SECRET"
  );
});

test("Movies webhook secret is isolated from the Master webhook secret", () => {
  const env = {
    TELEGRAM_WEBHOOK_SECRET: "MASTER_WEBHOOK_SECRET",
    TELEGRAM_MOVIES_WEBHOOK_SECRET: "MOVIES_WEBHOOK_SECRET"
  };

  assert.equal(getTelegramWebhookSecret(env, "movies"), "MOVIES_WEBHOOK_SECRET");
  assert.equal(getTelegramWebhookSecret(env, "findly"), "MASTER_WEBHOOK_SECRET");
  assert.throws(
    () => getTelegramWebhookSecret({ TELEGRAM_WEBHOOK_SECRET: "MASTER_WEBHOOK_SECRET" }, "movies"),
    (error) => error.code === "TELEGRAM_CONFIG_ERROR"
  );
});

import { buildTitleCaption, buildMoviePosterCard } from "./movies-bot.js";

test("builds a single photo caption with movie metadata and a Telegram-safe overview", () => {
  const caption = buildTitleCaption({
    title: "Wicker",
    release_year: 2026,
    media_type: "movie",
    runtime_minutes: 104,
    rating: 7.8,
    genres: ["Drama", "Thriller"],
    overview: "A suspenseful story.",
    metadata_status: "pending"
  });
  assert.match(caption, /Wicker/);
  assert.match(caption, /2026/);
  assert.match(caption, /فيلم/);
  assert.match(caption, /104 دقيقة/);
  assert.match(caption, /7\.8\/10/);
  assert.match(caption, /التصنيف: Drama، Thriller/);
  assert.match(caption, /A suspenseful story\./);
  assert.ok(caption.replace(/<[^>]*>/g, "").length <= 1024);
});

test("truncates long overview without exceeding Telegram photo caption limit", () => {
  const caption = buildTitleCaption({
    title: "Long film",
    release_year: 2026,
    media_type: "movie",
    overview: "قصة طويلة ".repeat(500),
    metadata_status: "pending"
  });
  assert.ok(caption.replace(/<[^>]*>/g, "").length <= 1024);
  assert.ok(caption.includes("…"));
  assert.doesNotMatch(caption, /المشاهدة داخل FINDLY غير متاحة|المشاهدة متاحة/);
});


test("builds a poster card that opens the existing movie details callback", () => {
  const card = buildMoviePosterCard({
    id: "550e8400-e29b-41d4-a716-446655440000",
    title: "Bad Romance: The Vicky White Story",
    release_year: 2023,
    media_type: "movie",
    rating: 7.4
  });

  assert.match(card.caption, /Bad Romance: The Vicky White Story/);
  assert.match(card.caption, /2023/);
  assert.match(card.caption, /7\.4\/10/);
  assert.deepEqual(card.reply_markup.inline_keyboard[0][0], {
    text: "📖 عرض التفاصيل",
    callback_data: "movies:title:550e8400-e29b-41d4-a716-446655440000"
  });
});
