import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261108000100_movie_media_assets.sql", import.meta.url),
  "utf8"
);

test("creates a private registry for Telegram channel media references", () => {
  assert.match(migration, /create table if not exists public\.movie_media_assets/i);
  assert.match(migration, /references public\.movie_titles\(id\) on delete cascade/i);
  assert.match(migration, /unique \(storage_chat_id, storage_message_id\)/i);
  assert.match(migration, /alter table public\.movie_media_assets enable row level security/i);
  assert.match(migration, /revoke all on table public\.movie_media_assets from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.movie_media_assets to service_role/i);
});

test("keeps video bytes out of the database and stores Telegram file references only", () => {
  assert.match(migration, /storage_message_id bigint not null/i);
  assert.match(migration, /file_id text not null/i);
  assert.match(migration, /file_unique_id text not null/i);
  assert.match(migration, /comment on table public\.movie_media_assets/i);
  assert.doesNotMatch(migration, /bytea|large object/i);
});
