import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMovieQueueTitle, selectTmdbQueueMatch } from "./movie-queue.js";

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

test("selects one exact normalized TMDB title from ambiguous results", () => {
  const exact = { tmdb_id: 42, title: "The Matrix" };
  const results = [
    { tmdb_id: 12, title: "The Matrix Reloaded" },
    exact,
    { tmdb_id: 13, title: "The Matrix Revolutions" }
  ];
  assert.equal(selectTmdbQueueMatch(results, " the matrix "), exact);
});

test("does not guess when multiple TMDB results are plausible", () => {
  const results = [
    { tmdb_id: 12, title: "It" },
    { tmdb_id: 13, title: "It" }
  ];
  assert.equal(selectTmdbQueueMatch(results, "It"), null);
});

test("does not auto-import a sole result when its title differs from the query", () => {
  const only = { tmdb_id: 88, title: "A Single Result" };
  assert.equal(selectTmdbQueueMatch([only], "Another query"), null);
});

test("accepts one exact TMDB title match", () => {
  const only = { tmdb_id: 89, title: "A Single Result" };
  assert.equal(selectTmdbQueueMatch([only], "a single result"), only);
});
