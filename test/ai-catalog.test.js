import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_CATALOG_TOOLS,
  searchCatalog,
  recommendCatalogTitles,
  findSimilarCatalogTitles,
  executeCatalogTool
} from "../src/lib/ai-catalog.js";

function createSupabaseMock(handler) {
  const calls = [];
  return {
    calls,
    from(table) {
      const operations = [];
      const builder = {};
      for (const method of ["select", "eq", "ilike", "order", "limit", "in", "not"]) {
        builder[method] = (...args) => {
          operations.push([method, ...args]);
          return builder;
        };
      }
      builder.then = (resolve, reject) => Promise.resolve()
        .then(() => handler(table, operations))
        .then(resolve, reject);
      calls.push({ table, operations });
      return builder;
    }
  };
}

const title = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "Dune",
  original_title: "Dune",
  media_type: "movie",
  release_year: 2021,
  release_date: "2021-10-22",
  rating: 8.0,
  runtime_minutes: 155,
  overview: "A science fiction story."
};

test("catalog tools expose only fixed read-only functions", () => {
  assert.deepEqual(
    AI_CATALOG_TOOLS.map((tool) => tool.function.name),
    ["search_catalog", "recommend_catalog_titles", "find_similar_titles"]
  );
  for (const tool of AI_CATALOG_TOOLS) {
    assert.equal(tool.function.parameters.additionalProperties, false);
  }
});

test("searchCatalog filters to active titles, bounds query and returns catalog-backed fields", async () => {
  const db = createSupabaseMock((table) => {
    if (table === "movie_titles") return { data: [title], error: null };
    if (table === "movie_title_genres") {
      return { data: [{ title_id: title.id, movie_genres: { name: "Science Fiction" } }], error: null };
    }
    throw new Error("unexpected table " + table);
  });
  const results = await searchCatalog(db, { query: "  Dune%_  " });
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].genres, ["Science Fiction"]);
  assert.equal(results[0].title, "Dune");
  assert.equal("full_plot_summary" in results[0], false);
  const titleCalls = db.calls.filter((call) => call.table === "movie_titles");
  assert.equal(titleCalls.length, 2);
  for (const call of titleCalls) {
    assert.ok(call.operations.some(([method, column, value]) => method === "eq" && column === "status" && value === "active"));
    assert.ok(call.operations.some(([method, column, value]) => method === "ilike" && value === "%Dune%"));
    assert.ok(call.operations.some(([method, value]) => method === "limit" && value === 5));
  }
});

test("searchCatalog ranks exact title matches ahead of partial matches", async () => {
  const exact = { ...title, id: "exact", title: "Dune", rating: 7.5 };
  const partial = { ...title, id: "partial", title: "Dune: Part Two", rating: 9.0 };
  const db = createSupabaseMock((table) => {
    if (table === "movie_titles") return { data: [partial, exact], error: null };
    if (table === "movie_title_genres") return { data: [], error: null };
    throw new Error("unexpected table " + table);
  });
  const results = await searchCatalog(db, { query: "Dune" });
  assert.deepEqual(results.map((item) => item.id), ["exact", "partial"]);
});

test("searchCatalog returns an empty list for an empty or unsafe-only query without database access", async () => {
  const db = createSupabaseMock(() => ({ data: [], error: null }));
  assert.deepEqual(await searchCatalog(db, { query: " %_* " }), []);
  assert.equal(db.calls.length, 0);
});

test("recommendCatalogTitles filters by genre and active status with a bounded limit", async () => {
  const db = createSupabaseMock((table, ops) => {
    if (table === "movie_genres") return { data: [{ id: "genre-1", name: "Drama" }], error: null };
    if (table === "movie_title_genres") {
      const select = ops.find(([method]) => method === "select")?.[1];
      return { data: select === "title_id"
        ? [{ title_id: title.id }]
        : [{ title_id: title.id, movie_genres: { name: "Drama" } }], error: null };
    }
    if (table === "movie_titles") return { data: [title], error: null };
    throw new Error("unexpected table " + table);
  });
  const results = await recommendCatalogTitles(db, { genre: "Drama", sort: "top_rated", limit: 99 });
  assert.equal(results.length, 1);
  const titleCall = db.calls.find((call) => call.table === "movie_titles");
  assert.ok(titleCall.operations.some(([method, column, value]) => method === "eq" && column === "status" && value === "active"));
  assert.ok(titleCall.operations.some(([method, value]) => method === "limit" && value === 5));
  assert.ok(titleCall.operations.some(([method, column, value]) => method === "not" && column === "rating" && value === "is"));
});

test("recommendCatalogTitles returns no titles when the requested genre does not exist", async () => {
  const db = createSupabaseMock((table) => {
    if (table === "movie_genres") return { data: [], error: null };
    throw new Error("no further query should run");
  });
  assert.deepEqual(await recommendCatalogTitles(db, { genre: "Unknown" }), []);
  assert.equal(db.calls.length, 1);
});

test("findSimilarCatalogTitles ranks active titles by shared genres and excludes the reference title", async () => {
  const reference = { ...title, id: "dune", title: "Dune" };
  const arrival = { ...title, id: "arrival", title: "Arrival", rating: 7.9 };
  const bladeRunner = { ...title, id: "blade-runner", title: "Blade Runner 2049", rating: 8.0 };
  const db = createSupabaseMock((table, ops) => {
    if (table === "movie_titles") {
      const isSearch = ops.some(([method]) => method === "ilike");
      return { data: isSearch ? [reference] : [arrival, bladeRunner], error: null };
    }
    if (table === "movie_title_genres") {
      const select = ops.find(([method]) => method === "select")?.[1];
      if (select === "genre_id") return { data: [{ genre_id: "scifi" }], error: null };
      if (select === "title_id,genre_id") {
        return { data: [
          { title_id: "dune", genre_id: "scifi" },
          { title_id: "arrival", genre_id: "scifi" },
          { title_id: "blade-runner", genre_id: "scifi" }
        ], error: null };
      }
      return { data: [
        { title_id: "arrival", movie_genres: { name: "Science Fiction" } },
        { title_id: "blade-runner", movie_genres: { name: "Science Fiction" } }
      ], error: null };
    }
    throw new Error("unexpected table " + table);
  });
  const results = await findSimilarCatalogTitles(db, { title: "Dune", media_type: "movie", limit: 2 });
  assert.deepEqual(results.map((item) => item.id), ["blade-runner", "arrival"]);
  const candidateQuery = db.calls.find((call) =>
    call.table === "movie_titles" && call.operations.some(([method, column]) => method === "in" && column === "id")
  );
  assert.ok(candidateQuery.operations.some(([method, column, value]) => method === "eq" && column === "status" && value === "active"));
  assert.ok(candidateQuery.operations.some(([method, column, value]) => method === "eq" && column === "media_type" && value === "movie"));
  assert.ok(!candidateQuery.operations.some(([method, column, values]) => method === "in" && column === "id" && values.includes("dune")));
});

test("findSimilarCatalogTitles returns no results when the reference title has no catalog genres", async () => {
  const db = createSupabaseMock((table, ops) => {
    if (table === "movie_titles") return { data: [title], error: null };
    if (table === "movie_title_genres") {
      const select = ops.find(([method]) => method === "select")?.[1];
      return { data: select === "genre_id" ? [] : [], error: null };
    }
    throw new Error("unexpected table " + table);
  });
  assert.deepEqual(await findSimilarCatalogTitles(db, { title: "Dune" }), []);
});

test("executeCatalogTool rejects malformed arguments and unknown tool names safely", async () => {
  const db = createSupabaseMock(() => ({ data: [], error: null }));
  assert.deepEqual(await executeCatalogTool(db, "search_catalog", "{"), { error: "Invalid tool arguments." });
  assert.deepEqual(await executeCatalogTool(db, "drop_table", {}), { error: "Unsupported catalog tool." });
  assert.equal(db.calls.length, 0);
});

test("executeCatalogTool converts database failures into a safe response", async () => {
  const db = createSupabaseMock(() => { throw new Error("private database detail"); });
  assert.deepEqual(
    await executeCatalogTool(db, "search_catalog", { query: "Dune" }),
    { error: "Catalog lookup is temporarily unavailable." }
  );
});
