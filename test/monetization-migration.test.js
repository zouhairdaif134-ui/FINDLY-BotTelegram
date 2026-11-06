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
  assert.match(migration, /alter table public\.telegram_users[\s\S]*add column if not exists is_bot boolean not null default false/i);
  assert.match(migration, /create table(?: if not exists)? public\.monetization_user_exclusions/i);
  assert.match(migration, /reason text not null check \(reason in \('admin','test','manual'\)\)/i);
  assert.match(migration, /alter table public\.monetization_user_exclusions enable row level security/i);
  assert.match(migration, /grant all on table public\.monetization_user_exclusions to service_role/i);
});

test("calculates rolling MAU from real Telegram activity while excluding ineligible users", () => {
  assert.match(migration, /create or replace function public\.get_monetization_mau/i);
  assert.match(migration, /count\(distinct u\.telegram_user_id\)/i);
  assert.match(migration, /last_seen_at >= p_since/i);
  assert.match(migration, /is_active = true/i);
  assert.match(migration, /is_bot = false/i);
  assert.match(migration, /not exists \(\s*select 1\s+from public\.monetization_user_exclusions/is);
  assert.match(migration, /grant execute on function public\.get_monetization_mau\(timestamptz\) to service_role/i);
});

test("preserves financial provenance and corrections as append-only ledger entries", () => {
  assert.match(migration, /add column if not exists provenance text not null default 'provider_reported'/i);
  assert.match(migration, /add column if not exists entry_type text not null default 'revenue'/i);
  assert.match(migration, /add column if not exists direction text not null default 'credit'/i);
  assert.match(migration, /add column if not exists reverses_event_id uuid references public\.monetization_events/i);
  assert.match(migration, /reconciliation_status/i);
  assert.match(migration, /unique index[^;]*reverses_event_id/is);
  assert.match(migration, /revoke update, delete on table public\.monetization_events from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant select, insert on table public\.monetization_events to service_role/i);
  assert.match(migration, /revoke update, delete on table public\.ad_delivery_events from public, anon, authenticated, service_role/i);
});

test("summarizes net revenue by currency, source and provenance without treating delivery as revenue", () => {
  assert.match(migration, /create or replace function public\.get_monetization_revenue_summary/i);
  assert.match(migration, /sum\s*\(\s*case\s+(?:e\.)?direction\s+when\s+'credit'\s+then\s+(?:e\.)?amount\s+else\s*-\s*(?:e\.)?amount\s+end\s*\)/i);
  assert.match(migration, /group by (?:e\.)?currency, (?:e\.)?revenue_source, (?:e\.)?provenance/i);
  assert.match(migration, /grant execute on function public\.get_monetization_revenue_summary\(timestamptz\) to service_role/i);
});

test("stores accountable provider-zone verification rather than trusting an enabled flag", () => {
  assert.match(migration, /add column if not exists verified_by uuid references public\.admin_profiles/i);
  assert.match(migration, /add column if not exists verification_method text/i);
  assert.match(migration, /verification_method in \('owner_test_confirmation','provider_api'\)/i);
});

test("seeds granular monetization permissions for Owner without granting Manager by default", () => {
  assert.match(migration, /monetization\.view/i);
  assert.match(migration, /monetization\.providers\.manage/i);
  assert.match(migration, /monetization\.providers\.verify/i);
  assert.match(migration, /monetization\.placements\.manage/i);
  assert.match(migration, /monetization\.campaigns\.manage/i);
  assert.match(migration, /monetization\.transactions\.view/i);
  assert.match(migration, /monetization\.transactions\.manage/i);
  assert.match(migration, /monetization\.users\.manage/i);
  assert.match(migration, /where r\.name = 'owner'/i);
});

test("keeps publisher networks and all ad placements disabled until verified activation", () => {
  assert.match(migration, /update public\.ad_providers[\s\S]*set is_active = false[\s\S]*slug in \('monetag','adsterra'\)/i);
  assert.match(migration, /is_verified boolean not null default false/i);
  assert.match(migration, /is_active boolean not null default false/i);
  assert.match(migration, /is_enabled boolean not null default false/i);
  assert.match(migration, /status text not null default 'draft'/i);
});
