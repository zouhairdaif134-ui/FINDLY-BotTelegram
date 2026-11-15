export const DEFAULT_AD_CONFIG = Object.freeze({
  ads_enabled: false,
  sdk_enabled: false,
  provider_order: Object.freeze(["monetag", "adsgram"]),
  frequency: Object.freeze({
    max_per_session: 0,
    min_interval_minutes: 0,
    detail_views_before_interstitial: 3
  }),
  slots: Object.freeze({
    catalog_after_sixth: false,
    details_banner: false
  })
});

const PROVIDERS = new Set(["monetag", "adsgram"]);
const SESSION_STORAGE_KEY = "findly:ads:session:v2";
const LAST_SHOWN_STORAGE_KEY = "findly:ads:last-shown:v2";
const LEGACY_STORAGE_KEY = "findly:ads:frequency:v1";

export function normalizeAdConfig(value) {
  const input = value && typeof value === "object" ? value : {};
  const requestedProviders = Array.isArray(input.provider_order) ? input.provider_order : DEFAULT_AD_CONFIG.provider_order;
  const providerOrder = [...new Set(requestedProviders.filter((provider) => PROVIDERS.has(provider)))];
  const frequency = input.frequency && typeof input.frequency === "object" ? input.frequency : {};
  return {
    ads_enabled: input.ads_enabled === true,
    // Phase 1 deliberately ships without provider SDKs or executable ad rendering.
    sdk_enabled: input.sdk_enabled === true,
    provider_order: providerOrder.length ? providerOrder : [...DEFAULT_AD_CONFIG.provider_order],
    frequency: {
      max_per_session: Number.isInteger(frequency.max_per_session) && frequency.max_per_session >= 0 && frequency.max_per_session <= 20
        ? frequency.max_per_session
        : DEFAULT_AD_CONFIG.frequency.max_per_session,
      min_interval_minutes: Number.isInteger(frequency.min_interval_minutes) && frequency.min_interval_minutes >= 0 && frequency.min_interval_minutes <= 1440
        ? frequency.min_interval_minutes
        : DEFAULT_AD_CONFIG.frequency.min_interval_minutes,
      detail_views_before_interstitial: Number.isInteger(frequency.detail_views_before_interstitial) && frequency.detail_views_before_interstitial >= 3 && frequency.detail_views_before_interstitial <= 20
        ? frequency.detail_views_before_interstitial
        : DEFAULT_AD_CONFIG.frequency.detail_views_before_interstitial
    },
    slots: { catalog_after_sixth: false, details_banner: false }
  };
}

export function canDisplayAd(state = {}, limits = DEFAULT_AD_CONFIG.frequency, now = Date.now()) {
  const maxPerSession = Number.isInteger(limits.max_per_session) && limits.max_per_session >= 0 ? limits.max_per_session : DEFAULT_AD_CONFIG.frequency.max_per_session;
  const cooldownMinutes = Number.isFinite(Number(limits.min_interval_minutes)) && Number(limits.min_interval_minutes) >= 0 ? Number(limits.min_interval_minutes) : DEFAULT_AD_CONFIG.frequency.min_interval_minutes;
  if (maxPerSession > 0 && Number(state.session_count || 0) >= maxPerSession) return false;
  if (cooldownMinutes === 0) return true;
  const lastShownAt = Number(state.last_shown_at || 0);
  return !lastShownAt || now - lastShownAt >= cooldownMinutes * 60_000;
}

function safeRead(storage, key) {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

function safeWrite(storage, key, value) {
  try { storage?.setItem(key, value); } catch {}
}

export function readAdFrequencyState(sessionStorage, persistentStorage) {
  const session = sessionStorage || globalThis.sessionStorage;
  const persistent = persistentStorage || globalThis.localStorage;
  let sessionValue = {};
  try { sessionValue = JSON.parse(safeRead(session, SESSION_STORAGE_KEY) || "{}"); } catch {}
  let lastShownAt = 0;
  try {
    const current = safeRead(persistent, LAST_SHOWN_STORAGE_KEY);
    if (current !== null) lastShownAt = Number(current) || 0;
    else {
      // Preserve an existing cooldown once when upgrading from the old combined record.
      const legacy = JSON.parse(safeRead(persistent, LEGACY_STORAGE_KEY) || "{}");
      lastShownAt = Number(legacy.last_shown_at) || 0;
    }
  } catch {}
  return {
    session_count: Number.isInteger(sessionValue.session_count) && sessionValue.session_count >= 0 ? sessionValue.session_count : 0,
    detail_views: Number.isInteger(sessionValue.detail_views) && sessionValue.detail_views >= 0 ? sessionValue.detail_views : 0,
    viewed_title_ids: Array.isArray(sessionValue.viewed_title_ids) ? sessionValue.viewed_title_ids.filter((id) => typeof id === "string").slice(-5000) : [],
    last_ad_detail_views: Number.isInteger(sessionValue.last_ad_detail_views) && sessionValue.last_ad_detail_views >= 0 ? sessionValue.last_ad_detail_views : 0,
    last_shown_at: Number.isFinite(lastShownAt) && lastShownAt > 0 ? lastShownAt : 0
  };
}

export function writeAdFrequencyState(next, sessionStorage, persistentStorage) {
  const session = sessionStorage || globalThis.sessionStorage;
  const persistent = persistentStorage || globalThis.localStorage;
  const safe = {
    session_count: Math.max(0, Number(next?.session_count) || 0),
    last_shown_at: Math.max(0, Number(next?.last_shown_at) || 0),
    detail_views: Math.max(0, Number(next?.detail_views) || 0),
    viewed_title_ids: Array.isArray(next?.viewed_title_ids) ? next.viewed_title_ids.filter((id) => typeof id === "string").slice(-5000) : [],
    last_ad_detail_views: Math.max(0, Number(next?.last_ad_detail_views) || 0)
  };
  safeWrite(session, SESSION_STORAGE_KEY, JSON.stringify({
    session_count: safe.session_count,
    detail_views: safe.detail_views,
    viewed_title_ids: safe.viewed_title_ids,
    last_ad_detail_views: safe.last_ad_detail_views
  }));
  safeWrite(persistent, LAST_SHOWN_STORAGE_KEY, String(safe.last_shown_at));
  return safe;
}


export function adSlot(config, slotKey) {
  if (!config?.ads_enabled || !config?.sdk_enabled || !config?.slots?.[slotKey]) return "";
  return '<aside class="ad-slot" data-ad-slot="' + slotKey + '" aria-label="إعلان"><span class="ad-label">إعلان</span><div class="ad-slot-content"></div></aside>';
}

export function recordAdImpression(sessionStorage, now = Date.now(), persistentStorage) {
  const current = readAdFrequencyState(sessionStorage, persistentStorage);
  return writeAdFrequencyState({
    ...current,
    session_count: current.session_count + 1,
    last_shown_at: now
  }, sessionStorage, persistentStorage);
}


export function recordDetailClick(state, titleId, sessionStorage) {
  const id = String(titleId || "").trim();
  if (!id) return state;
  const viewed = Array.isArray(state?.viewed_title_ids) ? state.viewed_title_ids : [];
  if (viewed.includes(id)) return state;
  return writeAdFrequencyState({
    ...state,
    detail_views: Number(state?.detail_views || 0) + 1,
    viewed_title_ids: [...viewed, id]
  }, sessionStorage);
}

export function shouldTriggerInterstitial(state, threshold = 3) {
  const step = Number.isInteger(threshold) && threshold > 0 ? threshold : 3;
  return Number(state?.detail_views || 0) - Number(state?.last_ad_detail_views || 0) >= step;
}
