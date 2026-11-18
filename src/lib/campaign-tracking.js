import { getSupabase } from "./supabase.js";

const VISITOR_COOKIE_NAME = "findly_campaign_visitor";
const FALLBACK_MASTER_URL = "https://t.me/FindlySearch2026Bot";
const CAMPAIGN_SLUG_RE = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/i;
const VISIT_TOKEN_RE = /^[a-f0-9]{24}$/i;
const VISITOR_ID_RE = /^[a-f0-9]{32}$/i;
const ALLOWED_SOURCES = new Set(["facebook", "instagram", "whatsapp", "telegram", "x", "tiktok", "youtube", "direct"]);

export function resolveCampaignSource(campaignSlug) {
  const slug = String(campaignSlug || "").trim().toLowerCase();
  if (!CAMPAIGN_SLUG_RE.test(slug)) return null;
  const source = slug.split(/[_-]/, 1)[0];
  return ALLOWED_SOURCES.has(source) ? source : null;
}

export function buildCampaignStartPayload(visitToken) {
  const token = String(visitToken || "").toLowerCase();
  return VISIT_TOKEN_RE.test(token) ? "fc_" + token : null;
}

export function parseCampaignStartPayload(startPayload) {
  const match = /^fc_([a-f0-9]{24})$/i.exec(String(startPayload || ""));
  return match ? { visitToken: match[1].toLowerCase() } : null;
}

export function buildCampaignTelegramUrl(username, visitToken) {
  const normalizedUsername = String(username || "").replace(/^@/, "").trim();
  const payload = buildCampaignStartPayload(visitToken);
  if (!/^[A-Za-z0-9_]{5,32}$/.test(normalizedUsername) || !payload) return null;
  return "https://t.me/" + normalizedUsername + "?start=" + payload;
}

export function classifyCrawlerUserAgent(userAgent) {
  const value = String(userAgent || "");
  const knownCrawlers = [
    [/facebookexternalhit|facebot/i, "facebook"],
    [/whatsapp/i, "whatsapp"],
    [/telegrambot/i, "telegram"],
    [/twitterbot|xbot/i, "x"],
    [/discordbot/i, "discord"],
    [/slackbot/i, "slack"],
    [/linkedinbot/i, "linkedin"],
    [/pinterestbot/i, "pinterest"]
  ];
  for (const [pattern, crawlerName] of knownCrawlers) {
    if (pattern.test(value)) return { isBot: true, crawlerName };
  }
  if (/(?:bot|crawler|spider|preview|headless|curl|wget|python-requests|go-http-client|axios)/i.test(value)) {
    return { isBot: true, crawlerName: "other" };
  }
  return { isBot: false, crawlerName: null };
}

function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readVisitorCookie(request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const prefix = VISITOR_COOKIE_NAME + "=";
  const cookie = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  const value = cookie ? cookie.slice(prefix.length) : "";
  return VISITOR_ID_RE.test(value) ? value.toLowerCase() : null;
}

async function hashVisitorId(visitorId, campaignSlug) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(campaignSlug + ":" + visitorId));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getReferrerHost(request) {
  const referrer = request.headers.get("Referer");
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.toLowerCase().slice(0, 253);
  } catch {
    return null;
  }
}

function errorDetails(error) {
  return { code: error?.code || null, message: error?.message || "Unknown error" };
}

export async function handleCampaignRedirect(env, request, url) {
  const match = url.pathname.match(/^\/go\/([a-z0-9_-]{1,64})\/?$/i);
  if (!match) return null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
  }

  const campaignSlug = match[1].toLowerCase();
  const source = resolveCampaignSource(campaignSlug);
  if (!source) return new Response("Campaign not found", { status: 404 });

  let supabase;
  let bot;
  try {
    supabase = getSupabase(env);
    const { data, error } = await supabase
      .from("bots")
      .select("id,telegram_username")
      .eq("slug", "findly")
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    bot = data;
  } catch (error) {
    console.error("FINDLY campaign destination lookup failed:", JSON.stringify(errorDetails(error)));
    return new Response(null, {
      status: 302,
      headers: {
        Location: FALLBACK_MASTER_URL,
        "Cache-Control": "no-store, max-age=0",
        "Referrer-Policy": "no-referrer"
      }
    });
  }

  let destination = buildCampaignTelegramUrl(bot?.telegram_username, randomHex(12));
  if (!destination) destination = FALLBACK_MASTER_URL;
  const visitToken = new URL(destination).searchParams.get("start")?.slice(3) || null;
  const existingVisitorId = readVisitorCookie(request);
  const visitorId = existingVisitorId || randomHex(16);
  const visitorHash = await hashVisitorId(visitorId, campaignSlug);
  const crawler = classifyCrawlerUserAgent(request.headers.get("User-Agent"));
  const isBot = request.method === "HEAD" || crawler.isBot;
  const crawlerName = crawler.crawlerName || (request.method === "HEAD" ? "head" : null);
  const eventData = {
    campaign_slug: campaignSlug,
    source,
    visit_token: visitToken,
    visitor_hash: visitorHash,
    is_bot: isBot,
    crawler_name: crawlerName,
    referrer_host: getReferrerHost(request)
  };

  let visitSaved = false;
  if (bot?.id && visitToken) {
    try {
      const { error: insertError } = await supabase.from("analytics_events").insert({
        user_id: null,
        bot_id: bot.id,
        event_type: "campaign_visit",
        event_data: eventData
      });
      if (insertError) throw insertError;
      visitSaved = true;
    } catch (error) {
      console.error("FINDLY campaign visit tracking failed:", JSON.stringify(errorDetails(error)));
      destination = FALLBACK_MASTER_URL;
    }
  }

  const headers = new Headers({
    Location: destination,
    "Cache-Control": "no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow"
  });
  if (visitSaved && request.method === "GET" && !existingVisitorId) {
    headers.set("Set-Cookie", VISITOR_COOKIE_NAME + "=" + visitorId + "; Max-Age=2592000; Path=/; Secure; HttpOnly; SameSite=Lax");
  }
  return new Response(null, { status: 302, headers });
}

export async function recordCampaignStart(env, bot, internalUserId, startPayload) {
  const payload = parseCampaignStartPayload(startPayload);
  if (!payload || bot?.slug !== "findly" || !bot?.id || !internalUserId) return false;

  try {
    const supabase = getSupabase(env);
    const { data: visit, error: lookupError } = await supabase
      .from("analytics_events")
      .select("id,event_data")
      .eq("bot_id", bot.id)
      .eq("event_type", "campaign_visit")
      .contains("event_data", { visit_token: payload.visitToken })
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!visit || visit.event_data?.is_bot === true || visit.event_data?.started_at) return false;

    const eventData = { ...visit.event_data, started_at: new Date().toISOString(), start_bot_slug: bot.slug };
    const { data: updated, error: updateError } = await supabase
      .from("analytics_events")
      .update({ user_id: internalUserId, event_data: eventData })
      .eq("id", visit.id)
      .is("user_id", null)
      .select("id")
      .maybeSingle();

    if (updateError) throw updateError;
    return Boolean(updated);
  } catch (error) {
    console.error("FINDLY campaign start attribution failed:", JSON.stringify(errorDetails(error)));
    return false;
  }
}
