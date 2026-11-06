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
  assert.deepEqual(parseMoviesCallback("movies:plot:" + id), { action: "plot", id });
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

import { sendPhoto } from "../src/lib/telegram.js";

test("sendPhoto downloads the TMDB poster and uploads the image bytes to Telegram", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } });
    const photo = options.body.get("photo");
    assert.equal(options.body.get("chat_id"), "12345");
    assert.equal(photo.type, "image/png");
    assert.equal(photo.size, 4);
    assert.equal(options.body.get("caption"), "Wicker (2026)");
    return Response.json({ ok: true, result: { message_id: 99 } });
  };
  try {
    const result = await sendPhoto({ TELEGRAM_MOVIES_BOT_TOKEN: "test-token" }, "movies", "12345", "https://image.tmdb.org/t/p/w500/poster.jpg", { caption: "Wicker (2026)" });
    assert.equal(result.message_id, 99);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://image.tmdb.org/t/p/w500/poster.jpg");
    assert.ok(calls[1].url.endsWith("/sendPhoto"));
  } finally { globalThis.fetch = originalFetch; }
});

test("sendPhoto rejects non-TMDB poster URLs before making a network request", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error("unexpected network request"); };
  try {
    await assert.rejects(sendPhoto({ TELEGRAM_MOVIES_BOT_TOKEN: "test-token" }, "movies", "12345", "https://example.com/poster.jpg"), /Unsupported poster URL/);
    assert.equal(called, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("sendPhoto falls back to Telegram URL fetching when multipart upload is rejected", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } });
    if (calls.length === 2) return Response.json({ ok: false, description: "upload rejected" });
    assert.equal(JSON.parse(options.body).photo, "https://image.tmdb.org/t/p/w500/poster.jpg");
    return Response.json({ ok: true, result: { message_id: 100 } });
  };
  try {
    const result = await sendPhoto({ TELEGRAM_MOVIES_BOT_TOKEN: "test-token" }, "movies", "12345", "https://image.tmdb.org/t/p/w500/poster.jpg");
    assert.equal(result.message_id, 100);
    assert.equal(calls.length, 3);
  } finally { globalThis.fetch = originalFetch; }
});
