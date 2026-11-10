import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateSystemSettings, getMaintenanceDecision } from "../src/routes/system-settings.js";

test("system settings enforce FINDLY identity, Arabic, and Casablanca timezone defaults", () => {
  const value = validateSystemSettings({});
  assert.equal(value.app_name, "FINDLY");
  assert.equal(value.default_language, "ar");
  assert.equal(value.timezone, "Africa/Casablanca");
  assert.equal(value.master_maintenance_enabled, false);
  assert.equal(value.watch_maintenance_enabled, false);
});

test("maintenance cannot be enabled before an owner numeric Telegram ID is configured", () => {
  assert.throws(
    () => validateSystemSettings({ master_maintenance_enabled: true }),
    /owner.*numeric ID/i
  );
  assert.throws(
    () => validateSystemSettings({ watch_maintenance_enabled: true, owner_telegram_user_id: "@owner" }),
    /positive numeric Telegram user ID/i
  );
});

test("maintenance switches reject string values instead of coercing them", () => {
  assert.throws(
    () => validateSystemSettings({ owner_telegram_user_id: "123456789", master_maintenance_enabled: "false" }),
    /must be boolean/i
  );
});

test("owner Telegram ID is validated as a positive safe integer string", () => {
  assert.equal(
    validateSystemSettings({ owner_telegram_user_id: "123456789" }).owner_telegram_user_id,
    "123456789"
  );
  assert.throws(
    () => validateSystemSettings({ owner_telegram_user_id: "9007199254740992" }),
    /positive numeric Telegram user ID/i
  );
});

function mockEnv(settings) {
  return {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: "test-secret",
    __settings: settings
  };
}

test("maintenance allows the configured owner by numeric ID and denies another user", async () => {
  const settings = {
    owner_telegram_user_id: 123456789,
    maintenance_message: "صيانة",
    master_maintenance_enabled: true,
    watch_maintenance_enabled: false
  };
  const env = mockEnv(settings);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([settings]), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
  try {
    const owner = await getMaintenanceDecision(env, "findly", { message: { from: { id: 123456789 } } });
    const user = await getMaintenanceDecision(env, "findly", { message: { from: { id: 987654321 } } });
    assert.equal(owner.allow, true);
    assert.equal(user.allow, false);
    assert.equal(user.message, "صيانة");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("maintenance is isolated by bot and ignores channel-only updates", async () => {
  const settings = {
    owner_telegram_user_id: 123456789,
    maintenance_message: "صيانة",
    master_maintenance_enabled: true,
    watch_maintenance_enabled: false
  };
  const env = mockEnv(settings);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([settings]), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
  try {
    const watch = await getMaintenanceDecision(env, "movies", { message: { from: { id: 987654321 } } });
    const channel = await getMaintenanceDecision(env, "findly", { channel_post: { chat: { id: -100123 } } });
    assert.equal(watch.allow, true);
    assert.equal(watch.maintenance, false);
    assert.equal(channel.allow, true);
    assert.equal(channel.reason, "non_user_update");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("system settings migration keeps maintenance disabled and restricts table access", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20261111000100_system_settings.sql", import.meta.url), "utf8");
  assert.match(migration, /master_maintenance_enabled boolean not null default false/i);
  assert.match(migration, /watch_maintenance_enabled boolean not null default false/i);
  assert.match(migration, /owner_telegram_user_id bigint/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.system_settings from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update on table public\.system_settings to service_role/i);
});
