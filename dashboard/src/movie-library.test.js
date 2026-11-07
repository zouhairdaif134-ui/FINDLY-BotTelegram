import test from "node:test";
import assert from "node:assert/strict";
import { filterAndSortMovies, paginateMovies } from "./movie-library.js";

const movies = [
  { id: "1", title: "Dune: Part Two", media_type: "movie", release_year: 2024, rating: 8.5, status: "active", genres: ["Science Fiction"], updated_at: "2026-01-02" },
  { id: "2", title: "Dark", media_type: "series", release_year: 2017, rating: 8.7, status: "draft", genres: ["Mystery"], updated_at: "2026-01-03" },
  { id: "3", title: "Arrival", media_type: "movie", release_year: 2016, rating: 7.9, status: "inactive", genres: ["Science Fiction"], updated_at: "2026-01-01" }
];

test("filters library by title, type, year, genre and publication status", () => {
  const result = filterAndSortMovies(movies, {
    search: "dune", mediaType: "movie", year: "2024",
    genre: "Science Fiction", status: "active", sort: "title"
  });
  assert.deepEqual(result.map((item) => item.id), ["1"]);
});

test("sorts library by rating, title, newest and oldest", () => {
  assert.deepEqual(filterAndSortMovies(movies, { sort: "rating" }).map((item) => item.id), ["2", "1", "3"]);
  assert.deepEqual(filterAndSortMovies(movies, { sort: "title" }).map((item) => item.title), ["Arrival", "Dark", "Dune: Part Two"]);
  assert.deepEqual(filterAndSortMovies(movies, { sort: "oldest" }).map((item) => item.id), ["3", "1", "2"]);
});

test("paginates twenty titles and supports direct page selection", () => {
  const titles = Array.from({ length: 45 }, (_, index) => ({ id: String(index + 1) }));
  const result = paginateMovies(titles, 3, 20);
  assert.equal(result.total, 45);
  assert.equal(result.page, 3);
  assert.equal(result.pageCount, 3);
  assert.equal(result.start, 41);
  assert.equal(result.end, 45);
  assert.deepEqual(result.items.map((item) => item.id), ["41", "42", "43", "44", "45"]);
});

test("clamps an out-of-range page to the last available page", () => {
  const result = paginateMovies([{ id: "1" }, { id: "2" }], 99, 20);
  assert.equal(result.page, 1);
  assert.equal(result.pageCount, 1);
});
