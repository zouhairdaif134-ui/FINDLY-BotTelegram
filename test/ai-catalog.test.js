import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_CATALOG_TOOLS,
  searchCatalog,
  recommendCatalogTitles,
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

test("catalog tools expose only the two fixed read-only functions", () => {
  assert.deepEqual(
    AI_CATALOG_TOOLS.map((tool) => tool.function.name),
    ["search_catalog", "recommend_catalog_titles"]
  );
  for (const tool of AI_CATALOG_TOOLS) {
    assert.equal(tool.function.parameters.additionalProperties, false);
  }
});

test("searchCatalog filters to active titles, bounds query and returns catalog-backed fields", async () => {
  const db = createSupabaseMock((table, ops) => {
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

test("searchCatalog returns an empty list for an empty or unsafe-only query without database access", async () => {
  const db = createSupabaseMock(() => ({ data: [], error: null }));
  assert.deepEqual(await searchCatalog(db, { query: " %_* " }), []);
  assert.equal(db.calls.length, 0);
});

test("recommendCatalogTitles filters by genre and active status with a bounded limit", async () => {
  const db = createSupabaseMock((table, ops) => {
    if (table === "movie_genres") return { data: [{ id: "genre-1", name: "Drama" }], error: null };
    if (table === "movie_title_genres") return { data: [{ title_id: title.id }], error: null };
    if (table === "movie_titles") return { data: [title], error: null };
    if (table === "movie_title_genres") return { data: [], error: null };
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
