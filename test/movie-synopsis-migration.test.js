import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261107180000_movie_synopsis_arabic.sql", import.meta.url),
  "utf8"
);

test("stores source-language synopses in a private table, not the public movie catalog", () => {
  assert.match(migration, /create table if not exists public\.movie_synopsis_sources/i);
  assert.match(migration, /create trigger movie_synopsis_defaults/i);
  assert.match(migration, /new\.overview_language := 'pending'/i);
  assert.match(migration, /alter table public\.movie_synopsis_sources enable row level security/i);
  assert.match(migration, /revoke all on table public\.movie_synopsis_sources from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update on table public\.movie_synopsis_sources to service_role/i);
  assert.doesNotMatch(migration, /add column if not exists original_overview/i);
});

test("preserves legacy source text privately and hides legacy public synopses until localized", () => {
  assert.match(migration, /insert into public\.movie_synopsis_sources/i);
  assert.match(migration, /select id, overview, 'und'/i);
  assert.match(migration, /set overview = null/i);
  assert.match(migration, /overview_source = 'legacy'/i);
  assert.doesNotMatch(migration, /overview !~/i);
});

test("provides an audited synopsis update RPC restricted to service_role", () => {
  assert.match(migration, /create or replace function public\.admin_audit_update_movie_synopsis/i);
  assert.match(migration, /insert into public\.admin_audit_logs/i);
  assert.match(migration, /grant execute on function public\.admin_audit_update_movie_synopsis/i);
  assert.match(migration, /private_source_synopsis/i);
});
