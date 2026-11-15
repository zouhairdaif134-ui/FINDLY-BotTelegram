import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_AD_CONFIG, normalizeAdConfig, adSlot, canDisplayAd } from "../miniapp/ad-slot.js";

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
  assert.equal(adSlot({ ...config, sdk_enabled: true }, "catalog_after_sixth").includes('data-ad-slot="catalog_after_sixth"'), true);
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
