import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const migrationPath = new URL(
  "../supabase/migrations/20261106000500_monetization_controls.sql",
  import.meta.url
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

test("adds provider zones, channel placements, frequency policies and delivery events", () => {
  assert.match(migration, /create table(?: if not exists)? public\.ad_provider_zones/i);
  assert.match(migration, /create table(?: if not exists)? public\.ad_placements/i);
  assert.match(migration, /create table(?: if not exists)? public\.ad_frequency_policies/i);
  assert.match(migration, /create table(?: if not exists)? public\.ad_delivery_events/i);
});

test("constrains channels and ad formats to the approved delivery surfaces", () => {
  assert.match(migration, /channel[^;]*check[^;]*website[^;]*telegram/is);
  assert.match(migration, /format[^;]*check[^;]*banner[^;]*native[^;]*popup[^;]*video/is);
  assert.match(migration, /telegram_text/is);
  assert.match(migration, /telegram_card/is);
});

test("protects monetization configuration with RLS and service-role-only writes", () => {
  for (const table of [
    "ad_provider_zones",
    "ad_placements",
    "ad_frequency_policies",
    "ad_delivery_events"
  ]) {
    assert.match(
      migration,
      new RegExp("alter table public\\." + table + " enable row level security", "i")
    );
    assert.match(
      migration,
      new RegExp("grant all on table public\\." + table + " to service_role", "i")
    );
  }
  assert.match(migration, /revoke all on table public\.ad_provider_zones from public, anon, authenticated/i);
});

test("uses idempotency keys and indexed UTC event timestamps", () => {
  assert.match(migration, /idempotency_key text not null unique/i);
  assert.match(migration, /created_at timestamptz not null default now\(\)/i);
  assert.match(migration, /create index[^;]*ad_delivery_events[^;]*created_at/is);
});

test("supports explicit test/admin exclusions and known Telegram bot identities", () => {
  assert.match(migration, /alter table public\\.telegram_users[\\s\\S]*add column if not exists is_bot boolean not null default false/i);
  assert.match(migration, /create table(?: if not exists)? public\\.monetization_user_exclusions/i);
  assert.match(migration, /reason text not null check \\(reason in \\('admin','test','manual'\\)\\)/i);
  assert.match(migration, /alter table public\\.monetization_user_exclusions enable row level security/i);
  assert.match(migration, /grant all on table public\\.monetization_user_exclusions to service_role/i);
});
