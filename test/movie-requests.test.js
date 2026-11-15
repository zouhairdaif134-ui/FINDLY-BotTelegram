import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeMovieRequestStatus } from "../src/routes/movie-requests.js";
import { getTmdbRequestDetails } from "../src/routes/content.js";

test("movie request statuses are normalized and restricted to the workflow", () => {
  assert.equal(normalizeMovieRequestStatus("PENDING"), "pending");
  assert.equal(normalizeMovieRequestStatus("reviewing"), "reviewing");
  assert.equal(normalizeMovieRequestStatus("added"), "added");
  assert.equal(normalizeMovieRequestStatus("unknown"), null);
  assert.equal(normalizeMovieRequestStatus(""), null);
});

test("TMDB request metadata is fetched server-side and includes an official source URL", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /api\.themoviedb\.org\/3\/movie\/603/);
    return new Response(JSON.stringify({
      id: 603,
      title: "The Matrix",
      original_title: "The Matrix",
      release_date: "1999-03-31",
      vote_average: 8.2,
      overview: "A computer hacker learns about reality.",
      poster_path: "/matrix.jpg",
      backdrop_path: "/backdrop.jpg"
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await getTmdbRequestDetails({
      TMDB_COMMERCIAL_LICENSE_APPROVED: "true",
      TMDB_API_KEY: "test-token"
    }, "603", "movie");
    assert.equal(result.title, "The Matrix");
    assert.equal(result.release_year, 1999);
    assert.equal(result.tmdb_url, "https://www.themoviedb.org/movie/603");
    assert.match(result.poster_path, /^https:\/\/image\.tmdb\.org\//);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("TMDB request metadata rejects invalid ids before making a network request", async () => {
  await assert.rejects(
    getTmdbRequestDetails({ TMDB_COMMERCIAL_LICENSE_APPROVED: "true", TMDB_API_KEY: "test" }, "6abc", "movie"),
    /Invalid TMDB request identifier/
  );
});

test("movie request migration deduplicates titles and individual requesters transactionally", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20261115175559_movie_requests.sql", import.meta.url), "utf8");
  assert.match(migration, /unique \(tmdb_id, media_type\)/i);
  assert.match(migration, /primary key \(request_id, telegram_user_id\)/i);
  assert.match(migration, /on conflict on constraint movie_request_users_pkey do nothing/i);
  assert.match(migration, /if v_inserted = 1 then[\s\S]*request_count = r\.request_count \+ 1/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /grant execute .* to service_role/i);
});
