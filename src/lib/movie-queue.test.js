import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMovieQueueTitle, selectTmdbQueueMatch, isMovieQueueProcessingEnabled } from "./movie-queue.js";
import { assertTmdbAccessAllowed } from "../routes/content.js";

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

test("matches an exact original TMDB title when the localized title differs", () => {
  const only = { tmdb_id: 90, title: "The Shawshank Redemption", original_title: "Les Évadés" };
  assert.equal(selectTmdbQueueMatch([only], "Les Evades"), only);
});

test("rejects punctuation-only titles at enqueue normalization boundary", () => {
  assert.equal(normalizeMovieQueueTitle("!!! — ???"), "");
});

test("blocks TMDB access when neither commercial approval nor non-commercial development mode is enabled", () => {
  assert.throws(
    () => assertTmdbAccessAllowed({ TMDB_API_KEY: "configured" }),
    (error) => error.code === "TMDB_ACCESS_DISABLED" && error.status === 403
  );
});

test("allows TMDB access in explicit non-commercial development mode without claiming commercial approval", () => {
  assert.doesNotThrow(() => assertTmdbAccessAllowed({
    TMDB_API_KEY: "configured",
    TMDB_NONCOMMERCIAL_DEVELOPMENT: "true"
  }));
});

test("allows TMDB access when commercial approval is explicit", () => {
  assert.doesNotThrow(() => assertTmdbAccessAllowed({
    TMDB_API_KEY: "configured",
    TMDB_COMMERCIAL_LICENSE_APPROVED: "true"
  }));
});

test("enables hourly processing only for explicit non-commercial development or commercial approval", () => {
  assert.equal(isMovieQueueProcessingEnabled({}), false);
  assert.equal(isMovieQueueProcessingEnabled({ TMDB_COMMERCIAL_LICENSE_APPROVED: "false" }), false);
  assert.equal(isMovieQueueProcessingEnabled({ TMDB_COMMERCIAL_LICENSE_APPROVED: true }), false);
  assert.equal(isMovieQueueProcessingEnabled({ TMDB_COMMERCIAL_LICENSE_APPROVED: "true" }), true);
  assert.equal(isMovieQueueProcessingEnabled({ TMDB_NONCOMMERCIAL_DEVELOPMENT: "true" }), true);
  assert.equal(isMovieQueueProcessingEnabled({ TMDB_NONCOMMERCIAL_DEVELOPMENT: true }), false);
});
