import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMovieSearch,
  parseMoviesCallback,
  isMoviesSearchReply
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

test("recognizes only replies to the Movies search prompt", () => {
  assert.equal(isMoviesSearchReply({ reply_to_message: { text: "🔎 بحث FINDLY Movies\n..." } }), true);
  assert.equal(isMoviesSearchReply({ reply_to_message: { text: "unrelated" } }), false);
  assert.equal(isMoviesSearchReply({}), false);
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
