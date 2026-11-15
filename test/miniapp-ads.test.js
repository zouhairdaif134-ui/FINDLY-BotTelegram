import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_AD_CONFIG, normalizeAdConfig, adSlot, canDisplayAd, recordAdImpression } from "../miniapp/ad-slot.js";

test("ad runtime defaults closed and does not create visible slots", () => {
  const config = normalizeAdConfig(null);
  assert.equal(config.ads_enabled, false);
  assert.equal(config.sdk_enabled, false);
  assert.equal(adSlot(config, "catalog_after_sixth"), "");
  assert.equal(adSlot(config, "details_banner"), "");
});

test("server kill switch and SDK readiness are both required before a slot can render", () => {
  const config = normalizeAdConfig({
    ads_enabled: true,
    provider_order: ["monetag", "adsgram"],
    frequency: { max_per_session: 1, min_interval_minutes: 10 }
  });
  assert.equal(config.ads_enabled, true);
  assert.equal(config.sdk_enabled, false);
  assert.equal(adSlot(config, "catalog_after_sixth"), "");
  assert.equal(adSlot({ ...config, sdk_enabled: true }, "catalog_after_sixth"), "");
});

test("provider order is allow-listed and frequency values are bounded", () => {
  const config = normalizeAdConfig({
    ads_enabled: true,
    provider_order: ["unknown", "adsgram", "monetag"],
    frequency: { max_per_session: 99, min_interval_minutes: 0 }
  });
  assert.deepEqual(config.provider_order, ["adsgram", "monetag"]);
  assert.equal(config.frequency.max_per_session, 1);
  assert.equal(config.frequency.min_interval_minutes, 10);
});

test("shared frequency gate blocks a second slot in the same session and respects cooldown", () => {
  const state = { session_count: 1, last_shown_at: 1000 };
  const limits = { max_per_session: 1, min_interval_minutes: 10 };
  assert.equal(canDisplayAd(state, limits, 1001), false);
  assert.equal(canDisplayAd({ session_count: 0, last_shown_at: 1000 }, limits, 2000), false);
  assert.equal(canDisplayAd({ session_count: 0, last_shown_at: 1000 }, limits, 601001), true);
});

test("shared frequency state persists one counter record through the supplied storage adapter", async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
  const { readAdFrequencyState, writeAdFrequencyState } = await import("../miniapp/ad-slot.js");
  writeAdFrequencyState({ session_count: 1, last_shown_at: 5000, detail_views: 3 }, storage);
  assert.deepEqual(readAdFrequencyState(storage), {
    session_count: 1,
    last_shown_at: 5000,
    detail_views: 3
  });
});

test("production migration keeps ads disabled and stores provider-attributed events privately", async () => {
  const { readFile } = await import("node:fs/promises");
  const migration = await readFile(new URL("../supabase/migrations/20261115000100_miniapp_ads_phase1.sql", import.meta.url), "utf8");
  assert.match(migration, /ads_enabled boolean not null default false/i);
  assert.match(migration, /ads_provider_order text\[\].*monetag.*adsgram/is);
  assert.match(migration, /create table if not exists public\.miniapp_ad_events/i);
  assert.match(migration, /provider text not null check/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.miniapp_ad_events from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert on table public\.miniapp_ad_events to service_role/i);
});

test("recording an impression increments the shared counter and cooldown timestamp", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
  const result = recordAdImpression(storage, 9000);
  assert.equal(result.session_count, 1);
  assert.equal(result.last_shown_at, 9000);
  assert.equal(canDisplayAd(result, { max_per_session: 1, min_interval_minutes: 10 }, 700000), false);
});

test("server-side Monetag activation follows the admin switch and selected provider", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../src/routes/miniapp.js", import.meta.url), "utf8");
  assert.match(route, /ads_enabled:\s*data\?\.ads_enabled === true/);
  assert.match(route, /sdk_enabled:\s*providerOrder\.includes\("monetag"\)/);
});

test("telemetry service role is limited to read and insert operations", async () => {
  const { readFile } = await import("node:fs/promises");
  const migration = await readFile(new URL("../supabase/migrations/20261115000200_miniapp_ad_events_least_privilege.sql", import.meta.url), "utf8");
  assert.match(migration, /revoke all on table public\.miniapp_ad_events from service_role/i);
  assert.match(migration, /grant select, insert on table public\.miniapp_ad_events to service_role/i);
});
