import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMovieSearch,
  parseMoviesCallback,
  isMoviesSearchReply,
  parseMovieStartPayload,
  resolveMovieWatchAction,
  buildMovieMediaCopyPayload
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

test("parses media watch callbacks only with UUID asset identifiers", () => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  assert.deepEqual(parseMoviesCallback("movies:watch:" + id), { action: "watch", id });
  assert.equal(parseMoviesCallback("movies:watch:not-a-uuid"), null);
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


import { buildTitleCaption, sendTitleCard } from "../src/lib/movies-bot.js";

test("buildTitleCaption escapes metadata and keeps the rendered caption within Telegram's 1024-character limit", () => {
  const caption = buildTitleCaption({
    title: "A&B <The Film>",
    release_year: 2026,
    media_type: "movie",
    rating: 7.7,
    genres: ["Drama & Mystery"],
    overview: "😀 & <tag> ".repeat(300),
    metadata_status: "draft"
  });
  assert.match(caption, /A&amp;B &lt;The Film&gt;/);
  assert.match(caption, /Drama &amp; Mystery/);
  const rendered = caption
    .replace(/<b>/g, "")
    .replace(/<\/b>/g, "")
    .replace(/<i>/g, "")
    .replace(/<\/i>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  assert.ok(rendered.length <= 1024, "caption must stay within Telegram's 1024-character limit");
  assert.ok(rendered.includes("…"), "long overview should be truncated with an ellipsis");
  assert.doesNotMatch(caption, /المشاهدة داخل FINDLY غير متاحة|المشاهدة متاحة/);
});

test("buildTitleCaption provides a clean fallback synopsis when overview is missing", () => {
  const caption = buildTitleCaption({
    title: "Untitled",
    media_type: "movie",
    genres: [],
    overview: "",
    metadata_status: "draft"
  });
  assert.match(caption, /لا يتوفر ملخص لهذا العنوان حالياً/);
});


test("sendTitleCard sends a readable text card with its buttons when the poster is missing", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options = {}) => {
    request = { url: String(url), options };
    return Response.json({ ok: true, result: { message_id: 101 } });
  };
  try {
    const result = await sendTitleCard(
      { TELEGRAM_MOVIES_BOT_TOKEN: "test-token" },
      "movies",
      "12345",
      null,
      "<b>🎬 Untitled</b>",
      { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "Back", callback_data: "movies:home" }]] } }
    );
    assert.equal(result.message_id, 101);
    assert.ok(request.url.endsWith("/sendMessage"));
    const payload = JSON.parse(request.options.body);
    assert.equal(payload.text, "<b>🎬 Untitled</b>");
    assert.equal(payload.reply_markup.inline_keyboard[0][0].callback_data, "movies:home");
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("parses movie deep links with Facebook and Instagram attribution", () => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  assert.deepEqual(parseMovieStartPayload("movie_" + id + "_facebook"), { titleId: id, source: "facebook" });
  assert.deepEqual(parseMovieStartPayload("movie_" + id + "_instagram"), { titleId: id, source: "instagram" });
  assert.deepEqual(parseMovieStartPayload("movie_" + id), { titleId: id, source: null });
});

test("rejects invalid movie deep links and unknown attribution sources", () => {
  assert.equal(parseMovieStartPayload("movie_not-a-uuid_facebook"), null);
  assert.equal(parseMovieStartPayload("movie_550e8400-e29b-41d4-a716-446655440000_tiktok"), null);
});


test("parses direct-watch movie deep links without changing legacy movie links", () => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  assert.deepEqual(parseMovieStartPayload("movie_" + id + "_watch"), {
    titleId: id, source: null, action: "watch"
  });
  assert.deepEqual(parseMovieStartPayload("movie_" + id), {
    titleId: id, source: null
  });
});

test("direct-watch flow sends a single available asset and asks quality only for multiple assets", () => {
  assert.deepEqual(resolveMovieWatchAction([]), { action: "unavailable", asset: null });
  const original = { id: "asset-1", quality_label: "Original" };
  assert.deepEqual(resolveMovieWatchAction([original]), { action: "deliver", asset: original });
  const hd = { id: "asset-2", quality_label: "HD" };
  assert.deepEqual(resolveMovieWatchAction([original, hd]), { action: "choose_quality", asset: null });
});


test("builds a Telegram copyMessage request from the private storage channel reference", () => {
  const payload = buildMovieMediaCopyPayload({
    storage_chat_id: "-1001234567890",
    storage_message_id: "321",
    quality_label: "480p",
    file_id: "must-not-be-used"
  }, 987654321);
  assert.deepEqual(payload, {
    chat_id: 987654321,
    from_chat_id: "-1001234567890",
    message_id: 321,
    caption: "🎬 FINDLY Movies · 480p"
  });
});

test("rejects incomplete Telegram storage references instead of falling back to file_id", () => {
  assert.equal(buildMovieMediaCopyPayload({ file_id: "legacy-file-id" }, 987654321), null);
  assert.equal(buildMovieMediaCopyPayload({ storage_chat_id: "-100123", storage_message_id: "0" }, 987654321), null);
});
