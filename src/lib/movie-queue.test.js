import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMovieQueueTitle } from "./movie-queue.js";

test("normalizes whitespace, case, and punctuation consistently", () => {
  assert.equal(
    normalizeMovieQueueTitle("  THE   DARK-KNIGHT! "),
    normalizeMovieQueueTitle("the dark knight")
  );
});

test("normalizes Latin diacritics without changing the title meaning", () => {
  assert.equal(
    normalizeMovieQueueTitle("Amélie"),
    normalizeMovieQueueTitle("Amelie")
  );
});

test("keeps Arabic letters while removing separators", () => {
  assert.equal(
    normalizeMovieQueueTitle("  الرحلة: الأخيرة "),
    normalizeMovieQueueTitle("الرحلة الأخيرة")
  );
});

test("returns an empty key for empty input", () => {
  assert.equal(normalizeMovieQueueTitle("   "), "");
});
