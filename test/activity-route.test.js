import test from "node:test";
import assert from "node:assert/strict";
import { parseActivityFilters } from "../src/routes/activity.js";

test("parses bounded activity filters and defaults", () => {
  const filters = parseActivityFilters(new URL("https://example.test/api/activity"));
  assert.equal(filters.limit, 50);
  assert.equal(filters.offset, 0);
  assert.equal(filters.actorId, null);
  assert.equal(filters.result, null);
});

test("parses valid activity filters", () => {
  const filters = parseActivityFilters(new URL(
    "https://example.test/api/activity?limit=25&offset=50&action=movie.publish&entity_type=movie&result=success&from=2026-11-01T00%3A00%3A00Z&to=2026-11-06T23%3A59%3A59Z"
  ));
  assert.equal(filters.limit, 25);
  assert.equal(filters.offset, 50);
  assert.equal(filters.action, "movie.publish");
  assert.equal(filters.entityType, "movie");
  assert.equal(filters.result, "success");
  assert.equal(filters.from, "2026-11-01T00:00:00.000Z");
});

test("rejects invalid pagination, filters, and reversed date ranges", () => {
  for (const query of [
    "?limit=101",
    "?limit=0",
    "?offset=-1",
    "?entity_type=unknown",
    "?result=maybe",
    "?action=Bad Action",
    "?from=not-a-date",
    "?from=2026-11-06T00%3A00%3A00Z&to=2026-11-01T00%3A00%3A00Z",
    "?actor_id=not-a-uuid"
  ]) {
    assert.throws(() => parseActivityFilters(new URL("https://example.test/api/activity" + query)));
  }
});
