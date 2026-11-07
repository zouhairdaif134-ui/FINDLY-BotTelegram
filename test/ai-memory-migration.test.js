import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const migrationPath = new URL(
  "../supabase/migrations/20261106000500_ai_user_hybrid_memory.sql",
  import.meta.url
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

test("uses Telegram internal identity and bot scope, not Supabase Auth identity", () => {
  assert.match(migration, /user_id uuid not null references public\.telegram_users\(id\)/i);
  assert.match(migration, /bot_id uuid not null references public\.bots\(id\)/i);
  assert.doesNotMatch(migration, /references auth\.users/i);
  assert.match(migration, /unique \(user_id, bot_id\)/i);
});

test("requires explicit persistent-memory consent and stores preferences as JSON arrays", () => {
  assert.match(migration, /consent_status text not null default 'pending'/i);
  assert.match(migration, /consent_status in \('pending', 'granted', 'denied'\)/i);
  assert.match(migration, /preferences jsonb not null default '\[\]'::jsonb/i);
  assert.match(migration, /pending_preference text/i);
  assert.match(migration, /pending_action_token uuid/i);
  assert.match(migration, /pending_action_expires_at timestamptz/i);
  assert.match(migration, /pending_action in \('save', 'clear'\)/i);
  assert.match(migration, /consented_at timestamptz/i);
});

test("bounds session retention and message content", () => {
  assert.match(migration, /content text not null check \(char_length\(content\) between 1 and 4000\)/i);
  assert.match(migration, /expires_at timestamptz not null/i);
  assert.match(migration, /ai_user_session_messages_expiry_idx/i);
  assert.match(migration, /ai_user_session_messages_lookup_idx/i);
});

test("enforces service-role-only memory access with RLS", () => {
  for (const table of ["ai_user_memory_preferences", "ai_user_session_messages"]) {
    assert.match(migration, new RegExp("alter table public\\." + table + " enable row level security", "i"));
  }
  assert.match(migration, /revoke all on public\.ai_user_memory_preferences,[\s\S]*public\.ai_user_session_messages from public, anon, authenticated/i);
  assert.match(migration, /grant all on public\.ai_user_memory_preferences,[\s\S]*public\.ai_user_session_messages to service_role/i);
});

test("uses a pinned search path for the timestamp trigger function", () => {
  assert.match(migration, /create or replace function public\.set_ai_memory_updated_at\(\)[\s\S]*set search_path = ''/i);
});

test("indexes the bot foreign key without changing the per-user history index", () => {
  const followupPath = new URL(
    "../supabase/migrations/20261107000200_ai_memory_bot_fk_index.sql",
    import.meta.url
  );
  const followup = existsSync(followupPath)
    ? readFileSync(followupPath, "utf8")
    : "";
  assert.match(followup, /create index if not exists ai_user_session_messages_bot_idx/i);
  assert.match(followup, /on public\.ai_user_session_messages \(bot_id\)/i);
});
