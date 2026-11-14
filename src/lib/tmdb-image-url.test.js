import test from "node:test";
import assert from "node:assert/strict";
import { tmdbImageUrl } from "../../miniapp/tmdb-image-url.js";

test("normalizes full TMDB image URLs without duplicating their size segment", () => {
  assert.equal(tmdbImageUrl("https://image.tmdb.org/t/p/w500/poster.jpg", "w342"), "https://image.tmdb.org/t/p/w342/poster.jpg");
  assert.equal(tmdbImageUrl("https://image.tmdb.org/t/p/original/backdrop.jpg", "w1280"), "https://image.tmdb.org/t/p/w1280/backdrop.jpg");
});

test("supports TMDB image paths and rejects untrusted hosts and unsafe paths", () => {
  assert.equal(tmdbImageUrl("/poster.jpg", "w342"), "https://image.tmdb.org/t/p/w342/poster.jpg");
  assert.equal(tmdbImageUrl("https://evil.example/t/p/w500/poster.jpg", "w342"), "");
  assert.equal(tmdbImageUrl("//evil.example/poster.jpg", "w342"), "");
  assert.equal(tmdbImageUrl("https://image.tmdb.org/t/p/w500/../secret.jpg", "w342"), "");
  assert.equal(tmdbImageUrl("https://image.tmdb.org/t/p/w500/poster.jpg", "bad-size"), "");
});
