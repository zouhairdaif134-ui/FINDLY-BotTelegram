import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMovieQueueTitle, selectTmdbQueueMatch, isMovieQueueProcessingEnabled, parseMovieQueueLines } from "./movie-queue.js";
import { assertTmdbAccessAllowed } from "../routes/content.js";
import * as movieQueue from "./movie-queue.js";

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


test("parses mixed movie and series prefixes while preserving input order", () => {
  assert.deepEqual(parseMovieQueueLines(`MOVIE | Inception
TV | Breaking Bad
movie | Interstellar
tv | Dark`), [
    { title: "Inception", media_type: "movie" },
    { title: "Breaking Bad", media_type: "series" },
    { title: "Interstellar", media_type: "movie" },
    { title: "Dark", media_type: "series" }
  ]);
});

test("rejects unprefixed or invalid mixed queue lines instead of guessing their type", () => {
  assert.throws(
    () => parseMovieQueueLines("Inception\nTV | Dark"),
    /Each line must start with MOVIE \| or TV \|/
  );
});


test("enqueues a mixed batch with two Supabase requests and reports existing and in-batch duplicates", async () => {
  const calls = [];
  const existingRows = [{
    id: "existing-1",
    submitted_title: "The Matrix",
    normalized_title: "the matrix",
    media_type: "movie",
    status: "pending"
  }];
  const supabase = {
    from(table) {
      const state = { table, filters: [], insertRows: null };
      const builder = {
        select() { return builder; },
        in(column, values) { state.filters.push({ column, values }); return builder; },
        insert(rows) { state.insertRows = rows; return builder; },
        then(resolve, reject) {
          calls.push(state);
          if (state.insertRows) {
            return Promise.resolve({
              data: state.insertRows.map((row, index) => ({
                id: `new-${index}`,
                submitted_title: row.submitted_title,
                media_type: row.media_type,
                status: "pending",
                created_at: "2026-11-07T00:00:00.000Z"
              })),
              error: null
            }).then(resolve, reject);
          }
          return Promise.resolve({ data: state.table === "movie_titles" ? [] : existingRows, error: null }).then(resolve, reject);
        }
      };
      return builder;
    }
  };

  const batch = [
    { title: "Inception", media_type: "movie" },
    { title: "Breaking Bad", media_type: "series" },
    { title: "The Matrix", media_type: "movie" },
    { title: "inception!", media_type: "movie" },
    ...Array.from({ length: 96 }, (_, index) => ({
      title: `Unique Title ${index + 1}`,
      media_type: index % 2 === 0 ? "movie" : "series"
    }))
  ];
  const result = await movieQueue.enqueueMovieQueueBatch(supabase, batch, { userId: "admin-1" });

  assert.deepEqual(calls.map((call) => call.table), ["movie_titles", "movie_queue_items", "movie_queue_items"]);
  assert.equal(result.inserted.length, 98);
  assert.deepEqual(result.inserted.slice(0, 2).map((item) => item.submitted_title), ["Inception", "Breaking Bad"]);
  assert.deepEqual(result.duplicates.map((item) => ({
    title: item.title,
    existing_title: item.existing_title,
    status: item.status
  })), [
    { title: "The Matrix", existing_title: "The Matrix", status: "pending" },
    { title: "inception!", existing_title: "Inception", status: "duplicate_in_batch" }
  ]);
  assert.equal(result.total_requested, 100);
});


test("blocks titles already present in the catalog or any historical queue state", async () => {
  const calls = [];
  const catalogRows = [{
    id: "catalog-active-1",
    title: "Inception",
    normalized_title: "inception",
    media_type: "movie",
    status: "active",
    release_year: 2010
  }];
  const queueRows = [{
    id: "queue-published-1",
    submitted_title: "Breaking Bad",
    normalized_title: "breaking bad",
    media_type: "series",
    status: "published",
    catalog_title_id: "catalog-series-1"
  }];
  const supabase = {
    from(table) {
      const state = { table, insertRows: null, filters: [] };
      const builder = {
        select() { return builder; },
        in(column, values) { state.filters.push({ column, values }); return builder; },
        insert(rows) { state.insertRows = rows; return builder; },
        then(resolve, reject) {
          calls.push(state);
          const data = state.insertRows
            ? state.insertRows.map((row, index) => ({ id: "new-" + index, ...row, status: "pending" }))
            : state.table === "movie_titles" ? catalogRows : queueRows;
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        }
      };
      return builder;
    }
  };

  const result = await movieQueue.enqueueMovieQueueBatch(supabase, [
    { title: "Inception", media_type: "movie" },
    { title: "Breaking Bad", media_type: "series" },
    { title: "New Movie", media_type: "movie" }
  ], { userId: "admin-1" });

  assert.deepEqual(calls.map((call) => call.table), ["movie_titles", "movie_queue_items", "movie_queue_items"]);
  assert.deepEqual(result.inserted.map((item) => item.submitted_title), ["New Movie"]);
  assert.deepEqual(result.duplicates.map((item) => ({
    title: item.title,
    existing_title: item.existing_title,
    status: item.status,
    existing_type: item.existing_type
  })), [
    { title: "Inception", existing_title: "Inception", status: "active", existing_type: "catalog" },
    { title: "Breaking Bad", existing_title: "Breaking Bad", status: "published", existing_type: "queue" }
  ]);
});
