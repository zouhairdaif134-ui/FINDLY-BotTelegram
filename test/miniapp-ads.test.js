import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_AD_CONFIG, normalizeAdConfig, adSlot, canDisplayAd, recordAdImpression, readAdFrequencyState, writeAdFrequencyState, recordDetailClick, shouldTriggerInterstitial } from "../miniapp/ad-slot.js";

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
  assert.equal(config.frequency.max_per_session, 0);
  assert.equal(config.frequency.min_interval_minutes, 0);
});

test("shared frequency gate blocks a second slot in the same session and respects cooldown", () => {
  const state = { session_count: 1, last_shown_at: 1000 };
  const limits = { max_per_session: 1, min_interval_minutes: 10 };
  assert.equal(canDisplayAd(state, limits, 1001), false);
  assert.equal(canDisplayAd({ session_count: 0, last_shown_at: 1000 }, limits, 2000), false);
  assert.equal(canDisplayAd({ session_count: 0, last_shown_at: 1000 }, limits, 601001), true);
});

test("session counters reset with a new session while the cooldown persists", () => {
  const makeStorage = () => {
    const values = new Map();
    return {
      values,
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, value)
    };
  };
  const firstSession = makeStorage();
  const persistent = makeStorage();
  writeAdFrequencyState({ session_count: 1, last_shown_at: 5000, detail_views: 3 }, firstSession, persistent);
  assert.deepEqual(readAdFrequencyState(firstSession, persistent), {
    session_count: 1, last_shown_at: 5000, detail_views: 3, viewed_title_ids: [], last_ad_detail_views: 0
  });

  const nextSession = makeStorage();
  assert.deepEqual(readAdFrequencyState(nextSession, persistent), {
    session_count: 0, last_shown_at: 5000, detail_views: 0, viewed_title_ids: [], last_ad_detail_views: 0
  });
  assert.equal(canDisplayAd(readAdFrequencyState(nextSession, persistent), { max_per_session: 1, min_interval_minutes: 10 }, 600000), false);
  assert.equal(canDisplayAd(readAdFrequencyState(nextSession, persistent), { max_per_session: 1, min_interval_minutes: 10 }, 605000), true);
});

test("legacy combined storage preserves the last-shown cooldown but resets session counters", () => {
  const legacy = new Map([["findly:ads:frequency:v1", JSON.stringify({ session_count: 1, detail_views: 5, last_shown_at: 7000 })]]);
  const persistent = {
    getItem: (key) => legacy.get(key) ?? null,
    setItem: (key, value) => legacy.set(key, value)
  };
  const session = { getItem: () => null, setItem: () => {} };
  assert.deepEqual(readAdFrequencyState(session, persistent), {
    session_count: 0, detail_views: 0, viewed_title_ids: [], last_ad_detail_views: 0, last_shown_at: 7000
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

test("recording an impression increments the session counter and persists cooldown separately", () => {
  const sessionValues = new Map();
  const persistentValues = new Map();
  const session = { getItem: (key) => sessionValues.get(key) ?? null, setItem: (key, value) => sessionValues.set(key, value) };
  const persistent = { getItem: (key) => persistentValues.get(key) ?? null, setItem: (key, value) => persistentValues.set(key, value) };
  const result = recordAdImpression(session, 9000, persistent);
  assert.equal(result.session_count, 1);
  assert.equal(result.last_shown_at, 9000);
  assert.equal(sessionValues.has("findly:ads:last-shown:v2"), false);
  assert.equal(persistentValues.get("findly:ads:last-shown:v2"), "9000");
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


test("only distinct title-detail clicks count toward repeated ads", () => {
  const sessionValues = new Map();
  const session = { getItem: (key) => sessionValues.get(key) ?? null, setItem: (key, value) => sessionValues.set(key, value) };
  let state = readAdFrequencyState(session, { getItem: () => null, setItem: () => {} });
  state = recordDetailClick(state, "movie-a", session);
  state = recordDetailClick(state, "movie-a", session);
  state = recordDetailClick(state, "movie-b", session);
  assert.equal(state.detail_views, 2);
  state = recordDetailClick(state, "movie-c", session);
  assert.equal(state.detail_views, 3);
  assert.equal(shouldTriggerInterstitial(state, 3), true);
  state = { ...state, last_ad_detail_views: 3 };
  state = recordDetailClick(state, "movie-d", session);
  state = recordDetailClick(state, "movie-e", session);
  assert.equal(shouldTriggerInterstitial(state, 3), false);
  state = recordDetailClick(state, "movie-f", session);
  assert.equal(shouldTriggerInterstitial(state, 3), true);
});

test("click-based ad policy has no time cooldown or one-ad session cap", () => {
  const config = normalizeAdConfig({ ads_enabled: true, sdk_enabled: true, provider_order: ["monetag"], frequency: { max_per_session: 0, min_interval_minutes: 0, detail_views_before_interstitial: 3 } });
  assert.equal(config.frequency.max_per_session, 0);
  assert.equal(config.frequency.min_interval_minutes, 0);
  assert.equal(canDisplayAd({ session_count: 99, last_shown_at: 999999999 }, config.frequency, 1000000000), true);
});


test("app triggers a direct Monetag rewarded interstitial from the click threshold without a time interval", async () => {
  const { readFile } = await import("node:fs/promises");
  const app = await readFile(new URL("../miniapp/app.js", import.meta.url), "utf8");
  assert.match(app, /recordDetailClick\(adFrequencyState,titleId\)/);
  assert.match(app, /shouldTriggerInterstitial\(adFrequencyState,threshold\)/);
  assert.match(app, /Promise\.resolve\(showAd\(\)\)/);
  assert.doesNotMatch(app, /type:"inApp".*interval:600/);
});


test("database migration permits click-only ad frequency with no timer or session cap", async () => {
  const { readFile } = await import("node:fs/promises");
  const migration = await readFile(new URL("../supabase/migrations/20261115142856_miniapp_click_based_ad_frequency.sql", import.meta.url), "utf8");
  assert.match(migration, /max_per_session.*between 0 and 20/is);
  assert.match(migration, /min_interval_minutes.*between 0 and 1440/is);
  assert.match(migration, /detail_views_before_interstitial.*between 3 and 20/is);
});


test("click policy starts with a clean counter when upgrading from the previous session schema", () => {
  const oldValues = new Map([["findly:ads:session:v2", JSON.stringify({ session_count: 1, detail_views: 8 })]]);
  const session = { getItem: (key) => oldValues.get(key) ?? null, setItem: (key, value) => oldValues.set(key, value) };
  const persistent = { getItem: () => null, setItem: () => {} };
  const state = readAdFrequencyState(session, persistent);
  assert.equal(state.detail_views, 0);
  assert.equal(state.session_count, 0);
  assert.equal(shouldTriggerInterstitial(state, 3), false);
});


test("AdsGram is loaded separately and only gates the Watch Bot handoff", async () => {
  const { readFile } = await import("node:fs/promises");
  const app = await readFile(new URL("../miniapp/app.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../miniapp/index.html", import.meta.url), "utf8");
  assert.match(html, /sad\.adsgram\.ai\/js\/sad\.min\.js/);
  assert.match(app, /blockId:"int-59890"/);
  assert.match(app, /await controller\.show\(\)/);
  assert.match(app, /FINDLY AdsGram interstitial unavailable; continuing to Watch Bot/);
  assert.match(app, /function openWatchBotLink\(url\)/);
  assert.match(app, /tg\.openTelegramLink\(url\)/);
  assert.match(app, /window\.location\.assign\(url\)/);
  const watchHandler = app.slice(app.indexOf('if(b.dataset.watch){'), app.indexOf('if(b.dataset.favorite)', app.indexOf('if(b.dataset.watch){')));
  assert.doesNotMatch(watchHandler, /maybeShowMonetagInterstitial|show_12270189/);
});


test("AdsGram interstitial runs before each uploaded series episode redirects to Watch Bot", async () => {
  const { readFile } = await import("node:fs/promises");
  const app = await readFile(new URL("../miniapp/app.js", import.meta.url), "utf8");
  const episodeHandler = app.slice(app.indexOf('const episodeLink='), app.indexOf('const b=event.target.closest("button")'));
  assert.match(episodeHandler, /await showWatchInterstitial\(titleId\)/);
  assert.ok(episodeHandler.includes("openWatchBotLink(url)"));
  assert.match(app, /async function showWatchInterstitial\(titleId\)/);
});


test("episode handoff falls back to the Telegram deep link when openTelegramLink does not switch away from the Mini App", async () => {
  const { readFile } = await import("node:fs/promises");
  const app = await readFile(new URL("../miniapp/app.js", import.meta.url), "utf8");
  const handoff = app.slice(app.indexOf("function openWatchBotLink"), app.indexOf("function shareSheet"));
  assert.match(handoff, /openTelegramLink/);
  assert.match(handoff, /visibilitychange/);
  assert.match(handoff, /location\.assign\(url\)/);
});
