import { getSupabase } from "./supabase.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDERS = new Map([
  ["monetag", "external"],
  ["adsterra", "external"],
  ["direct", "direct"]
]);
const FORMATS = {
  website: new Set(["banner", "native", "popup", "video"]),
  telegram: new Set(["telegram_text", "telegram_card"])
};
const WEBSITE_POSITIONS = new Set(["top", "bottom", "between_cards", "within_content"]);
const PROVIDER_SETTING_KEYS = new Set([
  "site_domain",
  "publisher_id",
  "zone_id",
  "integration",
  "enabled_channels"
]);
const CREATIVE_KEYS = new Set([
  "title",
  "body",
  "image_url",
  "telegram_file_id",
  "cta_label",
  "alt_text"
]);

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " must be an object");
  }
  return value;
}

function rejectUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(label + " contains an unsupported field: " + key);
    }
  }
}

function assertSafeJson(value, label = "metadata", depth = 0) {
  if (depth > 6) throw new Error(label + " is too deeply nested");
  if (typeof value === "string") {
    if (/<\s*script|<\s*iframe|javascript\s*:/i.test(value)) {
      throw new Error(label + " contains executable content");
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertSafeJson(item, label, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/(html|script|token|secret|password|credential|api[_-]?key|authorization|private[_-]?key)/i.test(key)) {
        throw new Error(label + " contains a restricted field: " + key);
      }
      assertSafeJson(item, label, depth + 1);
    }
  }
}

function requireText(value, label, maxLength = 160) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength) {
    throw new Error(label + " is required and must be at most " + maxLength + " characters");
  }
  return text;
}

function requireUuid(value, label) {
  const id = String(value ?? "");
  if (!UUID_PATTERN.test(id)) throw new Error(label + " must be a valid UUID");
  return id;
}

function validateChannelFormat(channel, format) {
  if (!FORMATS[channel]) throw new Error("channel must be website or telegram");
  if (!FORMATS[channel].has(format)) {
    throw new Error("format is not supported for the selected channel");
  }
}

function validateHttpsUrl(value, label, required = false) {
  if (!value && !required) return null;
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error(label + " must be a valid HTTPS URL");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(label + " must be a safe HTTPS URL");
  }
  return url.toString();
}

function validateSchedule(input) {
  const startsAt = input.starts_at ? new Date(input.starts_at) : null;
  const endsAt = input.ends_at ? new Date(input.ends_at) : null;
  if (startsAt && !Number.isFinite(startsAt.getTime())) {
    throw new Error("starts_at must be a valid ISO date");
  }
  if (endsAt && !Number.isFinite(endsAt.getTime())) {
    throw new Error("ends_at must be a valid ISO date");
  }
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new Error("ends_at must be later than starts_at");
  }
  return {
    starts_at: startsAt ? startsAt.toISOString() : null,
    ends_at: endsAt ? endsAt.toISOString() : null
  };
}

function safeProviderSettings(value = {}) {
  const settings = requireObject(value, "settings");
  rejectUnknownKeys(settings, PROVIDER_SETTING_KEYS, "settings");
  assertSafeJson(settings, "settings");
  const result = {};
  if (settings.site_domain) {
    const domain = String(settings.site_domain).trim().toLowerCase();
    if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(domain)) {
      throw new Error("site_domain must be a valid hostname");
    }
    result.site_domain = domain;
  }
  for (const key of ["publisher_id", "zone_id", "integration"]) {
    if (settings[key] !== undefined) result[key] = requireText(settings[key], key, 160);
  }
  if (settings.enabled_channels !== undefined) {
    if (!Array.isArray(settings.enabled_channels) ||
        settings.enabled_channels.some((channel) => !["website", "telegram"].includes(channel))) {
      throw new Error("enabled_channels contains an unsupported channel");
    }
    result.enabled_channels = [...new Set(settings.enabled_channels)];
  }
  return result;
}

export function validateProviderInput(input) {
  const value = requireObject(input, "provider");
  rejectUnknownKeys(value, new Set(["slug", "name", "provider_type", "settings", "is_active"]), "provider");
  const slug = requireText(value.slug, "provider slug", 40).toLowerCase();
  const expectedType = PROVIDERS.get(slug);
  if (!expectedType) throw new Error("provider is not in the approved provider registry");
  if (value.provider_type && value.provider_type !== expectedType) {
    throw new Error("provider type does not match the approved provider registry");
  }
  return {
    slug,
    name: requireText(value.name, "provider name", 80),
    provider_type: expectedType,
    is_active: slug === "direct" ? false : value.is_active === true,
    settings: safeProviderSettings(value.settings || {})
  };
}

export function validateProviderZoneInput(input) {
  const value = requireObject(input, "provider zone");
  rejectUnknownKeys(value, new Set([
    "provider_id", "channel", "format", "external_zone_id", "site_domain", "metadata"
  ]), "provider zone");
  const channel = requireText(value.channel, "channel", 20);
  const format = requireText(value.format, "format", 30);
  validateChannelFormat(channel, format);
  const metadata = value.metadata || {};
  requireObject(metadata, "metadata");
  assertSafeJson(metadata);
  let siteDomain = null;
  if (value.site_domain) {
    siteDomain = String(value.site_domain).trim().toLowerCase();
    if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(siteDomain)) {
      throw new Error("site_domain must be a valid hostname");
    }
  }
  return {
    provider_id: requireUuid(value.provider_id, "provider_id"),
    channel,
    format,
    external_zone_id: requireText(value.external_zone_id, "external_zone_id", 160),
    site_domain: siteDomain,
    metadata,
    is_verified: false,
    is_active: false
  };
}

export function validatePlacementInput(input) {
  const value = requireObject(input, "placement");
  rejectUnknownKeys(value, new Set([
    "id", "channel", "page_key", "slot_key", "position", "format",
    "provider_zone_id", "is_enabled", "starts_at", "ends_at", "priority",
    "fallback", "metadata"
  ]), "placement");
  const channel = requireText(value.channel, "channel", 20);
  const format = requireText(value.format, "format", 30);
  validateChannelFormat(channel, format);
  const pageKey = requireText(value.page_key, "page_key", 64).toLowerCase();
  const slotKey = requireText(value.slot_key, "slot_key", 80).toLowerCase();
  if (!/^[a-z][a-z0-9_-]*$/.test(pageKey)) throw new Error("page_key is invalid");
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(slotKey)) throw new Error("slot_key is invalid");
  const position = requireText(value.position, "position", 40);
  if (channel === "website" && !WEBSITE_POSITIONS.has(position)) {
    throw new Error("website placement position is unsupported");
  }
  if (channel === "telegram" && position !== "interaction_trigger") {
    throw new Error("Telegram placements must use an interaction_trigger position");
  }
  const schedule = validateSchedule(value);
  const metadata = value.metadata || {};
  requireObject(metadata, "metadata");
  assertSafeJson(metadata);
  if (value.provider_zone_id) requireUuid(value.provider_zone_id, "provider_zone_id");
  const priority = value.priority === undefined ? 100 : Number(value.priority);
  if (!Number.isInteger(priority) || priority < 0 || priority > 10000) {
    throw new Error("priority must be an integer between 0 and 10000");
  }
  const fallback = value.fallback || "none";
  if (!["none", "hide"].includes(fallback)) throw new Error("fallback is unsupported");
  return {
    channel,
    page_key: pageKey,
    slot_key: slotKey,
    position,
    format,
    provider_zone_id: value.provider_zone_id || null,
    is_enabled: value.is_enabled === true,
    ...schedule,
    priority,
    fallback,
    metadata
  };
}

export function validateCampaignInput(input) {
  const value = requireObject(input, "campaign");
  rejectUnknownKeys(value, new Set([
    "id", "bot_id", "provider_id", "name", "campaign_type", "status",
    "target_url", "starts_at", "ends_at", "budget", "currency", "channel",
    "format", "creative", "targeting", "max_deliveries", "priority"
  ]), "campaign");
  const channel = requireText(value.channel, "channel", 20);
  const format = requireText(value.format, "format", 30);
  validateChannelFormat(channel, format);
  const campaignType = value.campaign_type || "external";
  if (campaignType !== "external") {
    throw new Error("direct advertiser campaigns are locked until Phase 2");
  }
  const status = value.status || "draft";
  if (status !== "draft") throw new Error("new campaigns must start as draft");
  const targetUrl = validateHttpsUrl(
    value.target_url,
    "target_url",
    channel === "telegram"
  );
  const creative = value.creative || {};
  requireObject(creative, "creative");
  rejectUnknownKeys(creative, CREATIVE_KEYS, "creative");
  assertSafeJson(creative, "creative");
  if (channel === "telegram") {
    requireText(creative.body, "creative body", 4000);
    requireText(creative.cta_label, "creative CTA label", 40);
    if (format === "telegram_card") {
      requireText(creative.title, "creative title", 120);
      if (!creative.image_url && !creative.telegram_file_id) {
        throw new Error("Telegram card requires an image");
      }
      if (creative.image_url) {
        creative.image_url = validateHttpsUrl(creative.image_url, "image_url", true);
      }
      if (creative.telegram_file_id) {
        creative.telegram_file_id = requireText(creative.telegram_file_id, "telegram_file_id", 512);
      }
    }
  }
  const targeting = value.targeting || {};
  requireObject(targeting, "targeting");
  assertSafeJson(targeting, "targeting");
  const schedule = validateSchedule(value);
  const maxDeliveries = value.max_deliveries === undefined || value.max_deliveries === null
    ? null
    : Number(value.max_deliveries);
  if (maxDeliveries !== null && (!Number.isInteger(maxDeliveries) || maxDeliveries < 1)) {
    throw new Error("max_deliveries must be a positive integer");
  }
  const priority = value.priority === undefined ? 100 : Number(value.priority);
  if (!Number.isInteger(priority) || priority < 0 || priority > 10000) {
    throw new Error("priority must be an integer between 0 and 10000");
  }
  const currency = String(value.currency || "MAD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("currency must be a three-letter code");
  const budget = value.budget === undefined || value.budget === null ? null : String(value.budget);
  if (budget !== null && !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(budget)) {
    throw new Error("budget must be a non-negative amount with at most two decimals");
  }
  return {
    bot_id: requireUuid(value.bot_id, "bot_id"),
    provider_id: requireUuid(value.provider_id, "provider_id"),
    name: requireText(value.name, "campaign name", 120),
    campaign_type: "external",
    status: "draft",
    target_url: targetUrl,
    ...schedule,
    budget,
    currency,
    channel,
    format,
    creative,
    targeting,
    max_deliveries: maxDeliveries,
    priority
  };
}

export function validateRevenueInput(input) {
  const value = requireObject(input, "revenue event");
  rejectUnknownKeys(value, new Set([
    "amount", "currency", "revenue_source", "provenance", "event_type",
    "external_reference", "campaign_id", "bot_id", "event_data"
  ]), "revenue event");
  const amount = String(value.amount ?? "").trim();
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
    throw new Error("amount must be a positive decimal value with at most two decimals");
  }
  const currency = String(value.currency || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("currency must be a three-letter code");
  if (value.revenue_source !== "external_ad") {
    throw new Error("only external_ad revenue is enabled in Phase 1; subscriptions and direct ads are locked");
  }
  const provenance = value.provenance || "manual";
  if (!["provider_reported", "manual", "estimated"].includes(provenance)) {
    throw new Error("revenue provenance is invalid");
  }
  const eventType = requireText(value.event_type, "event_type", 64);
  const eventData = value.event_data || {};
  requireObject(eventData, "event_data");
  assertSafeJson(eventData, "event_data");
  return {
    amount,
    currency,
    revenue_source: "external_ad",
    provenance,
    event_type: eventType,
    external_reference: value.external_reference
      ? requireText(value.external_reference, "external_reference", 160)
      : null,
    campaign_id: value.campaign_id ? requireUuid(value.campaign_id, "campaign_id") : null,
    bot_id: value.bot_id ? requireUuid(value.bot_id, "bot_id") : null,
    event_data: eventData
  };
}

export function validateFrequencyPolicyInput(input) {
  const value = requireObject(input, "frequency policy");
  rejectUnknownKeys(value, new Set([
    "channel", "campaign_id", "placement_id", "max_per_user",
    "cooldown_seconds", "max_per_session", "rolling_window_minutes", "is_enabled"
  ]), "frequency policy");
  const channel = requireText(value.channel, "channel", 20);
  if (!["website", "telegram"].includes(channel)) throw new Error("channel is invalid");
  const campaignId = value.campaign_id ? requireUuid(value.campaign_id, "campaign_id") : null;
  const placementId = value.placement_id ? requireUuid(value.placement_id, "placement_id") : null;
  if (campaignId && placementId) throw new Error("frequency policy can target one campaign or one placement, not both");
  const boundedInteger = (raw, fallback, name, min, max) => {
    const number = raw === undefined ? fallback : Number(raw);
    if (!Number.isInteger(number) || number < min || number > max) {
      throw new Error(name + " must be an integer between " + min + " and " + max);
    }
    return number;
  };
  return {
    channel,
    campaign_id: campaignId,
    placement_id: placementId,
    max_per_user: boundedInteger(value.max_per_user, 3, "max_per_user", 1, 100),
    cooldown_seconds: boundedInteger(value.cooldown_seconds, 3600, "cooldown_seconds", 0, 604800),
    max_per_session: boundedInteger(value.max_per_session, 1, "max_per_session", 1, 20),
    rolling_window_minutes: boundedInteger(value.rolling_window_minutes, 1440, "rolling_window_minutes", 1, 43200),
    is_enabled: value.is_enabled !== false
  };
}

function safeProviderView(provider) {
  const settings = provider?.settings && typeof provider.settings === "object"
    ? provider.settings
    : {};
  const publicSettings = {};
  for (const key of PROVIDER_SETTING_KEYS) {
    if (key === "site_domain" || key === "publisher_id" || key === "zone_id" || key === "integration") {
      if (typeof settings[key] === "string") publicSettings[key] = settings[key];
    }
    if (key === "enabled_channels" && Array.isArray(settings[key])) {
      publicSettings[key] = settings[key].filter((channel) => ["website", "telegram"].includes(channel));
    }
  }
  return {
    id: provider.id,
    name: provider.name,
    slug: provider.slug,
    provider_type: provider.provider_type,
    is_active: Boolean(provider.is_active),
    settings: publicSettings,
    created_at: provider.created_at,
    updated_at: provider.updated_at
  };
}

function throwIfError(error) {
  if (error) throw error;
}

export async function getMonetizationOverview(env) {
  const supabase = getSupabase(env);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const count = (table, filters = []) => {
    let query = supabase.from(table).select("id", { count: "exact", head: true });
    for (const [method, field, value] of filters) query = query[method](field, value);
    return query;
  };
  const [
    mauResult,
    campaignResult,
    placementResult,
    subscriptionResult,
    websiteAttempted,
    websiteSent,
    websiteFailed,
    telegramAttempted,
    telegramSent,
    telegramFailed,
    revenueResult
  ] = await Promise.all([
    supabase.rpc("get_monetization_mau", { p_since: since }),
    count("ad_campaigns", [["eq", "status", "active"]]),
    count("ad_placements", [["eq", "is_enabled", true]]),
    count("user_subscriptions", [["eq", "status", "active"]]),
    count("ad_delivery_events", [["eq", "channel", "website"], ["eq", "event_type", "attempted"], ["gte", "occurred_at", since]]),
    count("ad_delivery_events", [["eq", "channel", "website"], ["eq", "event_type", "sent"], ["gte", "occurred_at", since]]),
    count("ad_delivery_events", [["eq", "channel", "website"], ["eq", "event_type", "failed"], ["gte", "occurred_at", since]]),
    count("ad_delivery_events", [["eq", "channel", "telegram"], ["eq", "event_type", "attempted"], ["gte", "occurred_at", since]]),
    count("ad_delivery_events", [["eq", "channel", "telegram"], ["eq", "event_type", "sent"], ["gte", "occurred_at", since]]),
    count("ad_delivery_events", [["eq", "channel", "telegram"], ["eq", "event_type", "failed"], ["gte", "occurred_at", since]]),
    supabase.rpc("get_monetization_revenue_summary", { p_since: since })
  ]);
  for (const result of [
    mauResult, campaignResult, placementResult, subscriptionResult,
    websiteAttempted, websiteSent, websiteFailed,
    telegramAttempted, telegramSent, telegramFailed, revenueResult
  ]) {
    throwIfError(result.error);
  }
  const mau = Number(mauResult.data || 0);
  return {
    mau_30d: mau,
    mau_target: 1000,
    phase2_eligible: mau >= 1000,
    phase2_activation_requires_owner_approval: true,
    active_subscriptions: subscriptionResult.count || 0,
    campaigns_active: campaignResult.count || 0,
    placements_enabled: placementResult.count || 0,
    delivery_30d: {
      website: {
        attempted: websiteAttempted.count || 0,
        sent: websiteSent.count || 0,
        failed: websiteFailed.count || 0
      },
      telegram: {
        attempted: telegramAttempted.count || 0,
        sent: telegramSent.count || 0,
        failed: telegramFailed.count || 0
      }
    },
    revenue_30d: revenueResult.data || []
  };
}

export async function listAdProviders(env) {
  const { data, error } = await getSupabase(env)
    .from("ad_providers")
    .select("id,name,slug,provider_type,is_active,settings,created_at,updated_at")
    .order("name", { ascending: true });
  throwIfError(error);
  return (data || []).map(safeProviderView);
}

export async function listAdProviderZones(env, filters = {}) {
  let query = getSupabase(env)
    .from("ad_provider_zones")
    .select("id,provider_id,channel,format,external_zone_id,site_domain,is_verified,is_active,verified_at,verified_by,verification_method,metadata,created_at,updated_at")
    .order("created_at", { ascending: false });
  if (filters.provider_id) query = query.eq("provider_id", requireUuid(filters.provider_id, "provider_id"));
  if (filters.channel) query = query.eq("channel", filters.channel);
  const { data, error } = await query;
  throwIfError(error);
  return data || [];
}

export async function listFrequencyPolicies(env, filters = {}) {
  let query = getSupabase(env)
    .from("ad_frequency_policies")
    .select("id,channel,campaign_id,placement_id,max_per_user,cooldown_seconds,max_per_session,rolling_window_minutes,is_enabled,created_at,updated_at")
    .order("channel", { ascending: true });
  if (filters.channel) query = query.eq("channel", filters.channel);
  const { data, error } = await query;
  throwIfError(error);
  return data || [];
}

export async function listAdPlacements(env, filters = {}) {
  let query = getSupabase(env)
    .from("ad_placements")
    .select("id,channel,page_key,slot_key,position,format,provider_zone_id,is_enabled,starts_at,ends_at,priority,fallback,metadata,created_at,updated_at")
    .order("priority", { ascending: true });
  if (filters.channel) query = query.eq("channel", filters.channel);
  if (filters.page_key) query = query.eq("page_key", filters.page_key);
  const { data, error } = await query;
  throwIfError(error);
  return data || [];
}

export async function listAdCampaigns(env, filters = {}) {
  let query = getSupabase(env)
    .from("ad_campaigns")
    .select("id,bot_id,provider_id,name,campaign_type,status,target_url,starts_at,ends_at,budget,currency,channel,format,creative,targeting,max_deliveries,priority,created_at,updated_at")
    .order("created_at", { ascending: false });
  if (filters.channel) query = query.eq("channel", filters.channel);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  throwIfError(error);
  return data || [];
}

export async function listCampaignPlacements(env, campaignId) {
  const id = requireUuid(campaignId, "campaign id");
  const { data, error } = await getSupabase(env)
    .from("ad_campaign_placements")
    .select("placement_id,placement:ad_placements(id,channel,page_key,slot_key,position,format,provider_zone_id,is_enabled)")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true });
  throwIfError(error);
  return data || [];
}

export async function listRevenueEvents(env, filters = {}) {
  const limit = Number(filters.limit ?? 50);
  const offset = Number(filters.offset ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("limit must be between 1 and 100");
  if (!Number.isInteger(offset) || offset < 0) throw new Error("offset must be non-negative");
  let query = getSupabase(env)
    .from("monetization_events")
    .select("id,bot_id,campaign_id,revenue_source,event_type,amount,currency,external_reference,provenance,entry_type,direction,reverses_event_id,reconciliation_status,occurred_at,created_at", { count: "exact" })
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (filters.revenue_source) query = query.eq("revenue_source", filters.revenue_source);
  if (filters.currency) query = query.eq("currency", filters.currency);
  if (filters.provenance) query = query.eq("provenance", filters.provenance);
  if (filters.from) query = query.gte("occurred_at", filters.from);
  if (filters.to) query = query.lte("occurred_at", filters.to);
  if (filters.campaign_id) query = query.eq("campaign_id", requireUuid(filters.campaign_id, "campaign_id"));
  const { data, error, count } = await query;
  throwIfError(error);
  return { items: data || [], total: count || 0, limit, offset };
}

export async function saveAdProvider(env, input) {
  const payload = validateProviderInput(input);
  if (payload.provider_type === "direct") throw new Error("direct advertiser providers are locked until Phase 2");
  const supabase = getSupabase(env);
  const { data: existing, error: lookupError } = await supabase
    .from("ad_providers")
    .select("id,is_active,provider_type")
    .eq("slug", payload.slug)
    .maybeSingle();
  throwIfError(lookupError);
  if (existing && input.is_active === undefined && payload.provider_type !== "direct") {
    delete payload.is_active;
  }
  if (input.is_active === true && payload.provider_type === "external") {
    const { data: zones, error: zonesError } = await supabase
      .from("ad_provider_zones")
      .select("id")
      .eq("provider_id", existing?.id || "00000000-0000-4000-8000-000000000000")
      .eq("is_verified", true)
      .eq("is_active", true)
      .limit(1);
    throwIfError(zonesError);
    if (!zones?.length) throw new Error("provider requires a verified active zone before it can be enabled");
  }
  const { data, error } = await supabase
    .from("ad_providers")
    .upsert(payload, { onConflict: "slug" })
    .select("id,name,slug,provider_type,is_active,settings,created_at,updated_at")
    .single();
  throwIfError(error);
  return safeProviderView(data);
}

export async function saveAdProviderZone(env, input) {
  const payload = validateProviderZoneInput(input);
  const supabase = getSupabase(env);
  const { data: provider, error: providerError } = await supabase
    .from("ad_providers")
    .select("id,slug,provider_type,is_active")
    .eq("id", payload.provider_id)
    .maybeSingle();
  throwIfError(providerError);
  if (!provider) throw new Error("provider was not found");
  if (provider.provider_type !== "external") throw new Error("direct advertiser provider is locked until Phase 2");
  const { data, error } = await supabase
    .from("ad_provider_zones")
    .insert(payload)
    .select("*")
    .single();
  throwIfError(error);
  return data;
}

export async function saveAdPlacement(env, input) {
  const payload = validatePlacementInput(input);
  const supabase = getSupabase(env);
  if (payload.is_enabled) {
    if (!payload.provider_zone_id) throw new Error("an enabled placement requires a verified provider zone");
    const { data: zone, error } = await supabase
      .from("ad_provider_zones")
      .select("id,channel,format,is_verified,is_active")
      .eq("id", payload.provider_zone_id)
      .maybeSingle();
    throwIfError(error);
    if (!zone || !zone.is_verified || !zone.is_active ||
        zone.channel !== payload.channel || zone.format !== payload.format) {
      throw new Error("provider zone is not verified and active for this placement");
    }
  }
  let query = supabase.from("ad_placements");
  if (input.id) {
    query = query.update(payload).eq("id", requireUuid(input.id, "placement id"));
  } else {
    query = query.insert(payload);
  }
  const { data, error } = await query
    .select("id,channel,page_key,slot_key,position,format,provider_zone_id,is_enabled,starts_at,ends_at,priority,fallback,metadata,created_at,updated_at")
    .single();
  throwIfError(error);
  return data;
}

export async function saveFrequencyPolicy(env, input) {
  const payload = validateFrequencyPolicyInput(input);
  const supabase = getSupabase(env);
  let lookup = supabase.from("ad_frequency_policies").select("id").eq("channel", payload.channel);
  if (payload.campaign_id) lookup = lookup.eq("campaign_id", payload.campaign_id);
  else lookup = lookup.is("campaign_id", null);
  if (payload.placement_id) lookup = lookup.eq("placement_id", payload.placement_id);
  else lookup = lookup.is("placement_id", null);
  const { data: existing, error: lookupError } = await lookup.maybeSingle();
  throwIfError(lookupError);
  const write = existing
    ? supabase.from("ad_frequency_policies").update(payload).eq("id", existing.id)
    : supabase.from("ad_frequency_policies").insert(payload);
  const { data, error } = await write.select("*").single();
  throwIfError(error);
  return data;
}

export async function saveAdCampaign(env, input) {
  const payload = validateCampaignInput(input);
  const supabase = getSupabase(env);
  const { data: provider, error: providerError } = await supabase
    .from("ad_providers")
    .select("id,provider_type")
    .eq("id", payload.provider_id)
    .maybeSingle();
  throwIfError(providerError);
  if (!provider) throw new Error("provider was not found");
  if (provider.provider_type !== "external") throw new Error("direct advertiser campaigns are locked until Phase 2");
  const { data: bot, error: botError } = await supabase
    .from("bots")
    .select("id,is_active")
    .eq("id", payload.bot_id)
    .maybeSingle();
  throwIfError(botError);
  if (!bot || !bot.is_active) throw new Error("campaign bot must exist and be active");
  let query = supabase.from("ad_campaigns");
  if (input.id) {
    const id = requireUuid(input.id, "campaign id");
    const { data: existing, error: existingError } = await supabase
      .from("ad_campaigns")
      .select("id,status")
      .eq("id", id)
      .maybeSingle();
    throwIfError(existingError);
    if (!existing) throw new Error("campaign was not found");
    if (["active", "scheduled"].includes(existing.status)) {
      throw new Error("pause the campaign before editing it");
    }
    if (["completed", "cancelled"].includes(existing.status)) {
      throw new Error("completed or cancelled campaigns cannot be edited");
    }
    payload.status = existing.status;
    query = query.update(payload).eq("id", id);
  } else {
    query = query.insert(payload);
  }
  const { data, error } = await query
    .select("id,bot_id,provider_id,name,campaign_type,status,target_url,starts_at,ends_at,budget,currency,channel,format,creative,targeting,max_deliveries,priority,created_at,updated_at")
    .single();
  throwIfError(error);
  return data;
}

export async function addCampaignPlacement(env, campaignId, placementId) {
  const campaignKey = requireUuid(campaignId, "campaign id");
  const placementKey = requireUuid(placementId, "placement id");
  const supabase = getSupabase(env);
  const { data: campaign, error: campaignError } = await supabase
    .from("ad_campaigns")
    .select("id,channel,format,status,campaign_type")
    .eq("id", campaignKey)
    .maybeSingle();
  throwIfError(campaignError);
  if (!campaign) throw new Error("campaign was not found");
  if (campaign.campaign_type !== "external") throw new Error("direct advertiser campaigns are locked until Phase 2");
  if (campaign.status === "active") throw new Error("pause the campaign before changing its placements");
  const { data: placement, error: placementError } = await supabase
    .from("ad_placements")
    .select("id,channel,format")
    .eq("id", placementKey)
    .maybeSingle();
  throwIfError(placementError);
  if (!placement || placement.channel !== campaign.channel || placement.format !== campaign.format) {
    throw new Error("placement channel and format must match the campaign");
  }
  const { error } = await supabase
    .from("ad_campaign_placements")
    .insert({ campaign_id: campaignKey, placement_id: placementKey });
  if (error && error.code !== "23505") throw error;
  return { campaign_id: campaignKey, placement_id: placementKey };
}

export async function removeCampaignPlacement(env, campaignId, placementId) {
  const campaignKey = requireUuid(campaignId, "campaign id");
  const placementKey = requireUuid(placementId, "placement id");
  const supabase = getSupabase(env);
  const { data: campaign, error: campaignError } = await supabase
    .from("ad_campaigns")
    .select("id,status")
    .eq("id", campaignKey)
    .maybeSingle();
  throwIfError(campaignError);
  if (!campaign) throw new Error("campaign was not found");
  if (campaign.status === "active") throw new Error("pause the campaign before changing its placements");
  const { error } = await supabase
    .from("ad_campaign_placements")
    .delete()
    .eq("campaign_id", campaignKey)
    .eq("placement_id", placementKey);
  throwIfError(error);
  return { campaign_id: campaignKey, placement_id: placementKey, removed: true };
}

export async function verifyAdProviderZone(env, zoneId, actor, confirmation) {
  const id = requireUuid(zoneId, "provider zone id");
  if (confirmation !== true) throw new Error("explicit Owner confirmation is required after testing the provider zone");
  if (!actor?.userId) throw new Error("verified administrator identity is required");
  const supabase = getSupabase(env);
  const { data: zone, error: zoneError } = await supabase
    .from("ad_provider_zones")
    .select("id,is_verified")
    .eq("id", id)
    .maybeSingle();
  throwIfError(zoneError);
  if (!zone) throw new Error("provider zone was not found");
  const { data, error } = await supabase
    .from("ad_provider_zones")
    .update({
      is_verified: true,
      is_active: false,
      verified_at: new Date().toISOString(),
      verified_by: actor.userId,
      verification_method: "owner_test_confirmation",
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("id,is_verified,is_active,verified_at,verified_by,verification_method")
    .single();
  throwIfError(error);
  return data;
}

export async function setAdProviderZoneStatus(env, zoneId, enabled) {
  const id = requireUuid(zoneId, "provider zone id");
  const supabase = getSupabase(env);
  const { data: zone, error: zoneError } = await supabase
    .from("ad_provider_zones")
    .select("id,is_verified")
    .eq("id", id)
    .maybeSingle();
  throwIfError(zoneError);
  if (!zone) throw new Error("provider zone was not found");
  if (enabled === true && !zone.is_verified) {
    throw new Error("provider zone must be verified before it can be enabled");
  }
  const { data, error } = await supabase
    .from("ad_provider_zones")
    .update({ is_active: enabled === true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,is_verified,is_active,updated_at")
    .single();
  throwIfError(error);
  return data;
}

export async function setAdProviderStatus(env, providerId, enabled) {
  const id = requireUuid(providerId, "provider id");
  const supabase = getSupabase(env);
  const { data: provider, error: providerError } = await supabase
    .from("ad_providers")
    .select("id,provider_type")
    .eq("id", id)
    .maybeSingle();
  throwIfError(providerError);
  if (!provider) throw new Error("provider was not found");
  if (provider.provider_type === "direct") throw new Error("direct advertisers are locked until Phase 2");
  if (enabled === true) {
    const { data: zones, error: zonesError } = await supabase
      .from("ad_provider_zones")
      .select("id")
      .eq("provider_id", id)
      .eq("is_verified", true)
      .eq("is_active", true)
      .limit(1);
    throwIfError(zonesError);
    if (!zones?.length) throw new Error("provider requires at least one verified active zone");
  }
  const { data, error } = await supabase
    .from("ad_providers")
    .update({ is_active: enabled === true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,name,slug,provider_type,is_active,settings,created_at,updated_at")
    .single();
  throwIfError(error);
  return safeProviderView(data);
}

export async function setCampaignStatus(env, campaignId, status) {
  const id = requireUuid(campaignId, "campaign id");
  if (!["scheduled", "active", "paused", "cancelled"].includes(status)) {
    throw new Error("campaign status transition is invalid");
  }
  const supabase = getSupabase(env);
  const { data: campaign, error: campaignError } = await supabase
    .from("ad_campaigns")
    .select("id,provider_id,campaign_type,channel,format,starts_at,ends_at,status")
    .eq("id", id)
    .maybeSingle();
  throwIfError(campaignError);
  if (!campaign) throw new Error("campaign was not found");
  if (campaign.campaign_type !== "external") throw new Error("direct advertiser campaigns are locked until Phase 2");
  if (campaign.status === "cancelled" || campaign.status === "completed") {
    throw new Error("a completed or cancelled campaign cannot be reactivated");
  }
  const now = Date.now();
  if (status === "scheduled") {
    if (!campaign.starts_at || new Date(campaign.starts_at).getTime() <= now) {
      throw new Error("scheduled campaigns require a future starts_at value");
    }
    if (campaign.ends_at && new Date(campaign.ends_at).getTime() <= new Date(campaign.starts_at).getTime()) {
      throw new Error("campaign ends_at must be later than starts_at");
    }
  }
  if (status === "active") {
    if (campaign.starts_at && new Date(campaign.starts_at).getTime() > now) {
      throw new Error("campaign is scheduled for a future start time");
    }
    if (campaign.ends_at && new Date(campaign.ends_at).getTime() <= now) {
      throw new Error("campaign schedule has already ended");
    }
    if (campaign.status === "draft" && campaign.starts_at && new Date(campaign.starts_at).getTime() > now) {
      throw new Error("schedule this campaign instead of activating it early");
    }
    if (!campaign.provider_id) throw new Error("campaign requires an external provider");
    const { data: provider, error: providerError } = await supabase
      .from("ad_providers")
      .select("id,provider_type,is_active")
      .eq("id", campaign.provider_id)
      .maybeSingle();
    throwIfError(providerError);
    if (!provider || provider.provider_type !== "external" || !provider.is_active) {
      throw new Error("campaign provider must be active and verified");
    }
    const { data: links, error: linksError } = await supabase
      .from("ad_campaign_placements")
      .select("placement_id")
      .eq("campaign_id", id);
    throwIfError(linksError);
    const placementIds = (links || []).map((item) => item.placement_id);
    if (!placementIds.length) throw new Error("campaign must be assigned to an enabled placement");
    const { data: placements, error: placementsError } = await supabase
      .from("ad_placements")
      .select("id,channel,format,provider_zone_id,is_enabled,starts_at,ends_at")
      .in("id", placementIds)
      .eq("is_enabled", true);
    throwIfError(placementsError);
    const compatiblePlacements = (placements || []).filter((item) =>
      item.channel === campaign.channel &&
      item.format === campaign.format &&
      item.provider_zone_id
    );
    if (!compatiblePlacements.length) {
      throw new Error("campaign must be linked to an enabled compatible placement");
    }
    const { data: zones, error: zoneError } = await supabase
      .from("ad_provider_zones")
      .select("id")
      .eq("provider_id", campaign.provider_id)
      .eq("channel", campaign.channel)
      .eq("format", campaign.format)
      .eq("is_verified", true)
      .eq("is_active", true);
    throwIfError(zoneError);
    const activeZoneIds = new Set((zones || []).map((zone) => zone.id));
    if (!compatiblePlacements.some((placement) => activeZoneIds.has(placement.provider_zone_id))) {
      throw new Error("campaign has no verified active provider zone attached to an enabled placement");
    }
  }
  if (status === "paused" && !["active", "scheduled"].includes(campaign.status)) {
    throw new Error("only active or scheduled campaigns can be paused");
  }
  const { data, error } = await supabase
    .from("ad_campaigns")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,status,channel,format,updated_at")
    .single();
  throwIfError(error);
  return data;
}

export async function recordManualRevenue(env, input) {
  const payload = validateRevenueInput({ ...input, provenance: "manual" });
  const { data, error } = await getSupabase(env)
    .from("monetization_events")
    .insert({
      ...payload,
      entry_type: "revenue",
      direction: "credit",
      reconciliation_status: "unreconciled"
    })
    .select("id,revenue_source,event_type,amount,currency,provenance,entry_type,direction,reconciliation_status,occurred_at")
    .single();
  throwIfError(error);
  return data;
}

export async function createRevenueAdjustment(env, input) {
  const value = requireObject(input, "revenue adjustment");
  rejectUnknownKeys(value, new Set(["original_event_id", "reason"]), "revenue adjustment");
  const originalId = requireUuid(value.original_event_id, "original_event_id");
  const reason = requireText(value.reason, "reason", 240);
  const supabase = getSupabase(env);
  const { data: original, error: originalError } = await supabase
    .from("monetization_events")
    .select("id,bot_id,campaign_id,revenue_source,event_type,amount,currency,provenance,entry_type,direction")
    .eq("id", originalId)
    .maybeSingle();
  throwIfError(originalError);
  if (!original) throw new Error("original revenue event was not found");
  if (original.entry_type === "reversal" || original.direction === "debit") {
    throw new Error("a reversal or debit entry cannot be reversed");
  }
  const { data: priorReversal, error: reversalError } = await supabase
    .from("monetization_events")
    .select("id")
    .eq("reverses_event_id", originalId)
    .maybeSingle();
  throwIfError(reversalError);
  if (priorReversal) throw new Error("this revenue event has already been reversed");
  const { data, error } = await supabase
    .from("monetization_events")
    .insert({
      bot_id: original.bot_id,
      campaign_id: original.campaign_id,
      revenue_source: original.revenue_source,
      event_type: "reversal",
      amount: String(original.amount),
      currency: original.currency,
      provenance: "manual",
      entry_type: "reversal",
      direction: "debit",
      reverses_event_id: originalId,
      reconciliation_status: "unreconciled",
      event_data: { reason, original_event_type: original.event_type }
    })
    .select("id,revenue_source,event_type,amount,currency,provenance,entry_type,direction,reverses_event_id,reconciliation_status,occurred_at")
    .single();
  throwIfError(error);
  return data;
}

export async function listUserExclusions(env) {
  const { data, error } = await getSupabase(env)
    .from("monetization_user_exclusions")
    .select("user_id,reason,note,created_by,created_at,updated_at")
    .order("created_at", { ascending: false });
  throwIfError(error);
  return data || [];
}

export async function saveUserExclusion(env, input, actor) {
  const value = requireObject(input, "user exclusion");
  rejectUnknownKeys(value, new Set(["user_id", "reason", "note"]), "user exclusion");
  if (!["admin", "test", "manual"].includes(value.reason)) throw new Error("exclusion reason is invalid");
  const payload = {
    user_id: requireUuid(value.user_id, "user_id"),
    reason: value.reason,
    note: value.note ? requireText(value.note, "note", 240) : null,
    created_by: actor?.userId || null,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await getSupabase(env)
    .from("monetization_user_exclusions")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id,reason,note,created_by,created_at,updated_at")
    .single();
  throwIfError(error);
  return data;
}

export async function deleteUserExclusion(env, userId) {
  const id = requireUuid(userId, "user_id");
  const { error } = await getSupabase(env)
    .from("monetization_user_exclusions")
    .delete()
    .eq("user_id", id);
  throwIfError(error);
  return { user_id: id, deleted: true };
}


export async function listExclusionCandidates(env, filters = {}) {
  const limit = Number(filters.limit ?? 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("candidate limit must be between 1 and 200");
  }
  let query = getSupabase(env)
    .from("telegram_users")
    .select("id,username,first_name,last_name,is_active,is_bot,last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  if (filters.search) {
    const term = String(filters.search).trim().replace(/[,%()]/g, "");
    if (term.length >= 2) {
      query = query.or("username.ilike.%"+term+"%,first_name.ilike.%"+term+"%,last_name.ilike.%"+term+"%");
    }
  }
  const { data, error } = await query;
  throwIfError(error);
  return data || [];
}


function isActiveSchedule(item, now = Date.now()) {
  const startsAt = item?.starts_at ? new Date(item.starts_at).getTime() : null;
  const endsAt = item?.ends_at ? new Date(item.ends_at).getTime() : null;
  return (!startsAt || startsAt <= now) && (!endsAt || endsAt > now);
}

export function buildTelegramAdPayload(campaign) {
  const creative = requireObject(campaign?.creative || {}, "campaign creative");
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const title = creative.title ? escape(creative.title) : "";
  const body = escape(creative.body || "");
  const text = [title, body].filter(Boolean).join("\\n\\n");
  const ctaLabel = escape(creative.cta_label || "اعرف المزيد");
  const targetUrl = validateHttpsUrl(campaign.target_url, "target_url", true);
  const replyMarkup = {
    inline_keyboard: [[{ text: creative.cta_label || "اعرف المزيد", url: targetUrl }]]
  };

  if (campaign.format === "telegram_card") {
    const photo = creative.telegram_file_id
      ? requireText(creative.telegram_file_id, "telegram_file_id", 512)
      : validateHttpsUrl(creative.image_url, "image_url", true);
    return {
      method: "photo",
      photo,
      caption: text.slice(0, 1024),
      parse_mode: "HTML",
      reply_markup: replyMarkup
    };
  }
  if (campaign.format !== "telegram_text") {
    throw new Error("Telegram campaign format is unsupported");
  }
  return {
    method: "message",
    text: (text + (text ? "\\n\\n" : "") + ctaLabel).slice(0, 4000),
    reply_markup: replyMarkup
  };
}

export async function claimTelegramAdDelivery(env, bot, update) {
  const telegramUser = update?.message?.from || update?.callback_query?.from;
  const updateId = update?.update_id;
  const chat = update?.message?.chat || update?.callback_query?.message?.chat;
  if (!bot?.id || !Number.isSafeInteger(updateId) || !telegramUser?.id ||
      chat?.type !== "private" || telegramUser.is_bot === true) {
    return null;
  }

  const supabase = getSupabase(env);
  const { data: user, error: userError } = await supabase
    .from("telegram_users")
    .select("id,is_active,is_bot")
    .eq("telegram_user_id", String(telegramUser.id))
    .maybeSingle();
  throwIfError(userError);
  if (!user?.id || !user.is_active || user.is_bot) return null;

  const now = Date.now();
  const { data: campaigns, error: campaignError } = await supabase
    .from("ad_campaigns")
    .select("id,bot_id,provider_id,name,status,target_url,starts_at,ends_at,channel,format,creative,max_deliveries,priority")
    .eq("bot_id", bot.id)
    .eq("channel", "telegram")
    .eq("campaign_type", "external")
    .eq("status", "active")
    .order("priority", { ascending: true })
    .limit(50);
  throwIfError(campaignError);

  for (const campaign of campaigns || []) {
    if (!isActiveSchedule(campaign, now)) continue;
    const { data: links, error: linkError } = await supabase
      .from("ad_campaign_placements")
      .select("placement_id")
      .eq("campaign_id", campaign.id);
    throwIfError(linkError);
    const placementIds = (links || []).map((link) => link.placement_id);
    if (!placementIds.length) continue;

    const { data: placements, error: placementError } = await supabase
      .from("ad_placements")
      .select("id,channel,format,position,provider_zone_id,is_enabled,starts_at,ends_at,priority")
      .in("id", placementIds)
      .eq("channel", "telegram")
      .eq("format", campaign.format)
      .eq("position", "interaction_trigger")
      .eq("is_enabled", true)
      .order("priority", { ascending: true });
    throwIfError(placementError);

    for (const placement of placements || []) {
      if (!placement.provider_zone_id || !isActiveSchedule(placement, now)) continue;
      const { data: zone, error: zoneError } = await supabase
        .from("ad_provider_zones")
        .select("id,provider_id,channel,format,is_verified,is_active")
        .eq("id", placement.provider_zone_id)
        .eq("provider_id", campaign.provider_id)
        .eq("channel", "telegram")
        .eq("format", campaign.format)
        .eq("is_verified", true)
        .eq("is_active", true)
        .maybeSingle();
      throwIfError(zoneError);
      if (!zone) continue;

      const { data: provider, error: providerError } = await supabase
        .from("ad_providers")
        .select("id,provider_type,is_active")
        .eq("id", campaign.provider_id)
        .eq("provider_type", "external")
        .eq("is_active", true)
        .maybeSingle();
      throwIfError(providerError);
      if (!provider) continue;

      const idempotencyKey = [
        "telegram", bot.id, updateId, campaign.id, placement.id
      ].join(":");
      const { data: claimed, error: claimError } = await supabase.rpc(
        "claim_monetization_ad_delivery",
        {
          p_idempotency_key: idempotencyKey,
          p_campaign_id: campaign.id,
          p_placement_id: placement.id,
          p_provider_zone_id: zone.id,
          p_user_id: user.id,
          p_bot_id: bot.id
        }
      );
      throwIfError(claimError);
      if (claimed === true) {
        return {
          idempotency_key: idempotencyKey,
          campaign_id: campaign.id,
          placement_id: placement.id,
          provider_zone_id: zone.id,
          user_id: user.id,
          bot_id: bot.id,
          campaign
        };
      }
    }
  }
  return null;
}

export async function recordTelegramAdDelivery(env, reservation, eventType, errorCode = null) {
  if (!reservation || !["sent", "failed"].includes(eventType)) return null;
  const payload = {
    idempotency_key: reservation.idempotency_key + ":" + eventType,
    campaign_id: reservation.campaign_id,
    placement_id: reservation.placement_id,
    provider_zone_id: reservation.provider_zone_id,
    user_id: reservation.user_id,
    bot_id: reservation.bot_id,
    channel: "telegram",
    event_type: eventType,
    error_code: errorCode ? String(errorCode).slice(0, 80) : null,
    metadata: { trigger: "telegram_interaction" }
  };
  const { data, error } = await getSupabase(env)
    .from("ad_delivery_events")
    .insert(payload)
    .select("id,event_type,occurred_at")
    .single();
  if (error?.code === "23505") return null;
  throwIfError(error);
  return data;
}
