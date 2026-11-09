import test from "node:test";
import assert from "node:assert/strict";
import { buildMovieShareContent, renderMovieSharePage, getMovieShareBotUsername } from "../src/lib/movie-sharing.js";

const movie = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "Wicker",
  release_year: 2026,
  rating: 7.7,
  runtime_minutes: 104,
  genres: ["Horror", "Mystery"],
  media_type: "movie",
  overview: "A fisherwoman lives on the outskirts of a village.",
  poster_path: "https://image.tmdb.org/t/p/w500/poster.jpg",
  status: "active"
};

test("builds one Facebook share package from the published movie record", () => {
  const share = buildMovieShareContent(movie, "@FindlySearch2026Bot", "facebook");
  assert.equal(share.telegramUrl, "https://t.me/FindlySearch2026Bot?start=movie_550e8400-e29b-41d4-a716-446655440000_facebook");
  assert.match(share.caption, /Wicker · 2026/);
  assert.match(share.caption, /7\.7\/10/);
  assert.match(share.caption, /104 دقيقة/);
  assert.match(share.caption, /Horror، Mystery/);
  assert.match(share.caption, /A fisherwoman lives/);
  assert.match(share.facebookShareUrl, /facebook\.com\/sharer/);
  assert.equal(share.posterUrl, movie.poster_path);
});

test("builds Instagram share package with the same movie-specific attribution", () => {
  const share = buildMovieShareContent(movie, "FindlySearch2026Bot", "instagram");
  assert.match(share.telegramUrl, /_instagram$/);
  assert.equal(share.facebookShareUrl, null);
  assert.match(share.caption, /https:\/\/t\.me\//);
});

test("refuses draft or inactive titles", () => {
  assert.throws(() => buildMovieShareContent({ ...movie, status: "draft" }, "FindlySearch2026Bot", "facebook"), /Only published/);
});

test("validates bot username, platform, and movie id", () => {
  assert.throws(() => buildMovieShareContent(movie, "bad username", "facebook"), /username/);
  assert.throws(() => buildMovieShareContent(movie, "FindlySearch2026Bot", "x"), /platform/);
  assert.throws(() => buildMovieShareContent({ ...movie, id: "nope" }, "FindlySearch2026Bot", "instagram"), /identifier/);
});

test("Facebook shares a public movie landing page, not the Telegram deep link", () => {
  const share = buildMovieShareContent(movie, "FindlySearch2026Bot", "facebook");
  assert.match(share.sharePageUrl, /^https:\/\/findly-v3-api\.berrchidcity99\.workers\.dev\/share\/movie\//);
  assert.match(share.facebookShareUrl, /sharer\/sharer\.php\?u=/);
  assert.ok(share.facebookShareUrl.includes(encodeURIComponent(share.sharePageUrl)));
  assert.ok(!share.facebookShareUrl.includes(encodeURIComponent(share.telegramUrl)));
});

test("renders Facebook crawler metadata and a Telegram action for the selected movie", () => {
  const html = renderMovieSharePage(movie, "FindlySearch2026Bot", "facebook", "https://findly-v3-api.berrchidcity99.workers.dev");
  assert.match(html, /property="og:title" content="Wicker · 2026"/);
  assert.match(html, /property="og:description" content="A fisherwoman lives[^"]*التقييم: 7\.7\/10[^"]*المدة: 104 دقيقة[^"]*التصنيف: Horror، Mystery/);
  assert.match(html, /property="og:image" content="https:\/\/image\.tmdb\.org/);
  assert.match(html, /التصنيف: Horror، Mystery/);
  assert.match(html, /المدة: 104 دقيقة/);
  assert.match(html, /href="https:\/\/t\.me\/FindlySearch2026Bot\?start=movie_/);
  assert.match(html, /افتح الفيلم في FINDLY Movies/);
});

test("escapes movie text before placing it in Open Graph HTML", () => {
  const html = renderMovieSharePage({ ...movie, title: '<script>alert("x")</script>' }, "FindlySearch2026Bot", "facebook");
  assert.ok(!html.includes('<script>alert("x")</script>'));
  assert.match(html, /&lt;script&gt;/);
});


test("selects the active Master bot username for public movie links, not the Watch bot", () => {
  assert.equal(getMovieShareBotUsername([
    { slug: "movies", telegram_username: "@FindlyMovies2026Bot", is_active: true },
    { slug: "findly", telegram_username: "@FindlySearch2026Bot", is_active: true }
  ]), "@FindlySearch2026Bot");
  assert.equal(getMovieShareBotUsername([
    { slug: "findly", telegram_username: "@OldMasterBot", is_active: false }
  ]), "");
});
