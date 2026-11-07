import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261107180000_movie_synopsis_arabic.sql", import.meta.url),
  "utf8"
);

test("adds Arabic synopsis metadata while preserving the original source text", () => {
  assert.match(migration, /add column if not exists original_overview text/i);
  assert.match(migration, /add column if not exists overview_language text/i);
  assert.match(migration, /add column if not exists overview_source text/i);
  assert.match(migration, /set original_overview = overview/i);
  assert.match(migration, /overview_language = case/i);
});

test("provides an audited synopsis update RPC restricted to service_role", () => {
  assert.match(migration, /create or replace function public\.admin_audit_update_movie_synopsis/i);
  assert.match(migration, /insert into public\.admin_audit_logs/i);
  assert.match(migration, /revoke all on function public\.admin_audit_update_movie_synopsis/i);
  assert.match(migration, /grant execute on function public\.admin_audit_update_movie_synopsis/i);
});
