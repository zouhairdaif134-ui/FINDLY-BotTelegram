import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMovieSearch,
  parseMoviesCallback,
  isMoviesSearchReply
} from "../src/lib/movies-bot.js";
import { getTelegramToken } from "../src/lib/telegram.js";

test("parses valid discovery and pagination callbacks", () => {
  assert.deepEqual(parseMoviesCallback("movies:new:2"), { action: "new", page: 2 });
  assert.deepEqual(parseMoviesCallback("movies:top:0"), { action: "top", page: 0 });
  assert.deepEqual(parseMoviesCallback("movies:series:1"), { action: "series", page: 1 });
});

test("rejects malformed callback data and non-UUID title identifiers", () => {
  assert.equal(parseMoviesCallback("movies:title:not-a-uuid"), null);
  assert.equal(parseMoviesCallback("admin:delete:123"), null);
  assert.equal(parseMoviesCallback("movies:unknown:0"), null);
});

test("parses title, favorite and season callbacks only with UUID identifiers", () => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  assert.deepEqual(parseMoviesCallback("movies:title:" + id), { action: "title", id });
  assert.deepEqual(parseMoviesCallback("movies:favorite:" + id), { action: "favorite", id });
  assert.deepEqual(parseMoviesCallback("movies:season:" + id), { action: "season", id });
});

test("normalizes search input, removes control characters and caps length", () => {
  assert.equal(normalizeMovieSearch("  Dune\nPart Two  "), "DunePart Two");
  assert.equal(normalizeMovieSearch("x".repeat(100)).length, 80);
  assert.equal(normalizeMovieSearch("   "), "");
});

test("detects only explicit replies to the Movies search prompt", () => {
  assert.equal(isMoviesSearchReply({ reply_to_message: { text: "🔎 بحث FINDLY Movies" } }), true);
  assert.equal(isMoviesSearchReply({ reply_to_message: { text: "another message" } }), false);
  assert.equal(isMoviesSearchReply({ text: "Dune" }), false);
});

test("uses a dedicated Movies token without modifying the existing multi-bot token map", () => {
  assert.equal(getTelegramToken({ TELEGRAM_MOVIES_BOT_TOKEN: "movies-token" }, "movies"), "movies-token");
  assert.equal(getTelegramToken({ TELEGRAM_BOT_TOKENS: '{"findly":"master-token"}' }, "findly"), "master-token");
  assert.throws(() => getTelegramToken({ TELEGRAM_BOT_TOKENS: '{"findly":"master-token"}' }, "movies"), /not configured/);
});
