import test from "node:test";
import assert from "node:assert/strict";
import { buildMovieShareContent } from "../src/lib/movie-sharing.js";

const movie = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "Wicker",
  release_year: 2026,
  rating: 7.7,
  overview: "A fisherwoman lives on the outskirts of a village.",
  poster_path: "https://image.tmdb.org/t/p/w500/poster.jpg",
  status: "active"
};

test("builds one Facebook share package from the published movie record", () => {
  const share = buildMovieShareContent(movie, "@FindlyMoviesBot", "facebook");
  assert.equal(share.telegramUrl, "https://t.me/FindlyMoviesBot?start=movie_550e8400-e29b-41d4-a716-446655440000_facebook");
  assert.match(share.caption, /Wicker · 2026/);
  assert.match(share.caption, /7\.7\/10/);
  assert.match(share.facebookShareUrl, /facebook\.com\/sharer/);
  assert.equal(share.posterUrl, movie.poster_path);
});

test("builds Instagram share package with the same movie-specific attribution", () => {
  const share = buildMovieShareContent(movie, "FindlyMoviesBot", "instagram");
  assert.match(share.telegramUrl, /_instagram$/);
  assert.equal(share.facebookShareUrl, null);
  assert.match(share.caption, /https:\/\/t\.me\//);
});

test("refuses draft or inactive titles", () => {
  assert.throws(() => buildMovieShareContent({ ...movie, status: "draft" }, "FindlyMoviesBot", "facebook"), /Only published/);
});

test("validates bot username, platform, and movie id", () => {
  assert.throws(() => buildMovieShareContent(movie, "bad username", "facebook"), /username/);
  assert.throws(() => buildMovieShareContent(movie, "FindlyMoviesBot", "x"), /platform/);
  assert.throws(() => buildMovieShareContent({ ...movie, id: "nope" }, "FindlyMoviesBot", "instagram"), /identifier/);
});

test("Facebook shares a public movie landing page, not the Telegram deep link", () => {
  const share = buildMovieShareContent(movie, "FindlyMoviesBot", "facebook");
  assert.match(share.sharePageUrl, /^https:\/\/findly-v3-api\.berrchidcity99\.workers\.dev\/share\/movie\//);
  assert.match(share.facebookShareUrl, /sharer\/sharer\.php\?u=/);
  assert.ok(share.facebookShareUrl.includes(encodeURIComponent(share.sharePageUrl)));
  assert.ok(!share.facebookShareUrl.includes(encodeURIComponent(share.telegramUrl)));
});
