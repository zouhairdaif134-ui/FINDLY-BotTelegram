import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261106000400_admin_audit_logs.sql", import.meta.url),
  "utf8"
);

test("creates an isolated append-only audit table with RLS", () => {
  assert.match(migration, /create table public\.admin_audit_logs/i);
  assert.match(migration, /alter table public\.admin_audit_logs enable row level security/i);
  assert.match(migration, /revoke all on table public\.admin_audit_logs from public, anon, authenticated, service_role/i);
  assert.match(migration, /actor_id uuid not null references public\.admin_profiles/i);
  assert.match(migration, /result text not null check \(result in \('success', 'failure'\)\)/i);
});

test("creates the dedicated activity permission for Owner only", () => {
  assert.match(migration, /values \('activity\.view'/i);
  assert.match(migration, /where r\.name = 'owner'/i);
  assert.doesNotMatch(migration, /where r\.name in \('manager','content_manager','owner'\)/i);
});

test("restricts privileged audit RPCs to service_role", () => {
  for (const fn of [
    "admin_audit_mutate",
    "admin_audit_update_admin",
    "admin_audit_create_admin",
    "admin_audit_record_event",
    "admin_audit_record_failure",
    "admin_audit_import_movie",
    "admin_audit_list"
  ]) {
    assert.match(migration, new RegExp("revoke all on function public\\." + fn + "\\(", "i"));
    assert.match(migration, new RegExp("grant execute on function public\\." + fn + "\\(", "i"));
  }
  assert.match(migration, /security definer/i);
});

test("sanitizes nested credentials and validates mutation entity allowlists", () => {
  assert.match(migration, /password\|token\|secret\|api\[_-\]\?key\|authorization\|credential/i);
  assert.match(migration, /unsupported audit entity type/i);
  assert.match(migration, /mutation payload contains unsupported fields/i);
  assert.match(migration, /old_values, new_values, result/i);
});
