import { getSupabase } from "../lib/supabase.js";
import { getTelegramToken } from "../lib/telegram.js";
import { buildMovieShareContent } from "../lib/movie-sharing.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60;
const AUTH_CACHE_TTL_MS = 5 * 60 * 1000;
const CATALOG_CACHE_TTL_MS = 60 * 1000;
const DETAILS_CACHE_TTL_MS = 60 * 1000;
const BOT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CATALOG_LIMIT = 40;
const MAX_CATALOG_LIMIT = 50;
const authCache = new Map();
const catalogCache = new Map();
const detailsCache = new Map();
let watchBotCache = { value: "", expiresAt: 0 };

export function parseCatalogPagination(body = {}) {
  const requestedLimit = Number.parseInt(body.limit, 10);
  const requestedOffset = Number.parseInt(body.offset, 10);
  return {
    limit: Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), MAX_CATALOG_LIMIT) : DEFAULT_CATALOG_LIMIT,
    offset: Number.isFinite(requestedOffset) ? Math.min(Math.max(requestedOffset, 0), 1000000) : 0
  };
}

export function truncateOverview(value, maxLength = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(1, maxLength - 1)).trimEnd() + "…";
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(keyBytes, message, cryptoImpl) {
  const key = await cryptoImpl.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return cryptoImpl.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}

export async function validateTelegramInitData(rawInitData, botToken, now = Date.now(), cryptoImpl = globalThis.crypto) {
  if (typeof rawInitData !== "string" || rawInitData.length < 20 || rawInitData.length > 8192) return null;
  if (typeof botToken !== "string" || !botToken || !cryptoImpl?.subtle) return null;

  const params = new URLSearchParams(rawInitData);
  const receivedHash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  const userRaw = params.get("user");
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash) || !Number.isSafeInteger(authDate) || !userRaw) return null;

  const nowSeconds = Math.floor(now / 1000);
  if (authDate > nowSeconds + 60 || nowSeconds - authDate > MAX_INIT_DATA_AGE_SECONDS) return null;

  const dataCheckString = Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + "=" + value)
    .join("\n");

  const secretKey = await hmac(new TextEncoder().encode("WebAppData"), botToken, cryptoImpl);
  const expectedHash = bytesToHex(await hmac(new Uint8Array(secretKey), dataCheckString, cryptoImpl));
  let difference = expectedHash.length ^ receivedHash.length;
  for (let index = 0; index < Math.min(expectedHash.length, receivedHash.length); index += 1) {
    difference |= expectedHash.charCodeAt(index) ^ receivedHash.toLowerCase().charCodeAt(index);
  }
  if (difference !== 0) return null;

  let user;
  try { user = JSON.parse(userRaw); } catch { return null; }
  if (!Number.isSafeInteger(user?.id) || user.id <= 0 || user.is_bot === true) return null;
  return { user, authDate };
}

async function authenticate(env, body) {
  let token;
  try { token = getTelegramToken(env, "findly"); } catch { return { error: "TELEGRAM_AUTH_UNAVAILABLE", status: 503 }; }
  const verified = await validateTelegramInitData(body?.init_data, token);
  if (!verified) return { error: "INVALID_TELEGRAM_SESSION", status: 401 };

  const user = verified.user;
  const userId = String(user.id);
  const now = Date.now();
  const cached = authCache.get(userId);
  if (cached && now - cached.checkedAt < AUTH_CACHE_TTL_MS) {
    if (cached.isActive === false) return { error: "USER_ACCESS_DISABLED", status: 403 };
    return { userId };
  }

  const { data: savedUser, error } = await getSupabase(env).from("telegram_users").upsert({
    telegram_user_id: userId,
    username: user.username || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    language_code: user.language_code || null,
    is_bot: false,
    last_seen_at: new Date(now).toISOString()
  }, { onConflict: "telegram_user_id" }).select("is_active").single();
  if (error) throw error;
  const isActive = savedUser?.is_active !== false;
  authCache.set(userId, { isActive, checkedAt: now });
  if (authCache.size > 5000) {
    for (const [key, value] of authCache) if (now - value.checkedAt >= AUTH_CACHE_TTL_MS) authCache.delete(key);
  }
  if (!isActive) return { error: "USER_ACCESS_DISABLED", status: 403 };
  return { userId };
}

function safeProviderUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}

async function getWatchBotUsername(supabase) {
  const now = Date.now();
  if (watchBotCache.expiresAt > now) return watchBotCache.value;
  const { data, error } = await supabase.from("bots")
    .select("telegram_username").eq("slug", "movies").eq("is_active", true).maybeSingle();
  if (error) throw error;
  watchBotCache = {
    value: String(data?.telegram_username || "").replace(/^@/, ""),
    expiresAt: now + BOT_CACHE_TTL_MS
  };
  return watchBotCache.value;
}

async function decorateTitles(supabase, titles) {
  const ids = (titles || []).map((title) => title.id);
  if (!ids.length) return [];

  const [genreResult, rightsResult, mediaResult] = await Promise.all([
    supabase.from("movie_title_genres").select("title_id,movie_genres(name,slug)").in("title_id", ids),
    supabase.from("movie_distribution_rights").select("title_id,status").in("title_id", ids).eq("status", "authorized"),
    supabase.from("movie_media_assets").select("title_id,id,file_id,media_type").in("title_id", ids).eq("status", "active")
  ]);
  for (const result of [genreResult, rightsResult, mediaResult]) if (result.error) throw result.error;

  const genresByTitle = new Map();
  for (const row of genreResult.data || []) {
    if (!genresByTitle.has(row.title_id)) genresByTitle.set(row.title_id, []);
    if (row.movie_genres?.name) genresByTitle.get(row.title_id).push(row.movie_genres.name);
  }
  const authorized = new Set((rightsResult.data || []).map((row) => row.title_id));
  const hasActiveMedia = new Set((mediaResult.data || []).filter((row) => row.file_id && ["video", "document"].includes(row.media_type)).map((row) => row.title_id));
  const needsWatchBot = (titles || []).some((title) => authorized.has(title.id) && hasActiveMedia.has(title.id));
  const watchUsername = needsWatchBot ? await getWatchBotUsername(supabase) : "";
  const validWatchUsername = /^[a-zA-Z0-9_]{5,32}$/.test(watchUsername);

  return (titles || []).map((title) => {
    const watchAvailable = authorized.has(title.id) && hasActiveMedia.has(title.id) && validWatchUsername;
    return {
      ...title,
      overview: truncateOverview(title.overview, 160),
      genres: genresByTitle.get(title.id) || [],
      watch_available: watchAvailable,
      watch_url: watchAvailable ? "https://t.me/" + watchUsername + "?start=movie_" + title.id + "_watch" : null
    };
  });
}

async function getCatalog(env, userId, body) {
  const supabase = getSupabase(env);
  const { limit, offset } = parseCatalogPagination(body);
  const type = ["movie", "series"].includes(body.media_type) ? body.media_type : null;
  const search = String(body.query || "").trim().replace(/[\u0000-\u001f%_*]/g, " ").slice(0, 80).trim();
  const genre = String(body.genre || "").trim().slice(0, 40);
  const favoritesOnly = body.favorites_only === true;
  const sort = body.sort === "top" ? "rating" : body.sort === "release" ? "release_date" : "created_at";
  const cacheKey = JSON.stringify({ limit, offset, type, search, genre, favoritesOnly, userId: favoritesOnly ? userId : null, sort });
  const now = Date.now();
  const favoritesPromise = supabase.from("movie_telegram_favorites")
    .select("title_id").eq("telegram_user_id", userId);
  let favoritesResult;
  let cached = catalogCache.get(cacheKey);

  if (!cached || cached.expiresAt <= now) {
    const relations = [];
    if (genre) relations.push("movie_title_genres!inner(movie_genres!inner(slug))");
    if (favoritesOnly) relations.push("movie_telegram_favorites!inner(telegram_user_id)");
    const selectFields = "id,title,original_title,media_type,release_year,release_date,runtime_minutes,rating,overview,poster_path,backdrop_path,created_at" + (relations.length ? "," + relations.join(",") : "");
    let query = supabase.from("movie_titles")
      .select(selectFields, { count: "exact" })
      .eq("status", "active");
    if (genre) query = query.eq("movie_title_genres.movie_genres.slug", genre);
    if (favoritesOnly) query = query.eq("movie_telegram_favorites.telegram_user_id", userId);
    if (type) query = query.eq("media_type", type);
    if (search) query = query.ilike("normalized_title", "%" + search + "%");

    const [titleResult, genresResult, userFavoritesResult] = await Promise.all([
      query.order(sort, { ascending: false, nullsFirst: false }).range(offset, offset + limit - 1),
      supabase.from("movie_genres").select("name,slug").order("name", { ascending: true }).limit(80),
      favoritesPromise
    ]);
    if (titleResult.error) throw titleResult.error;
    if (genresResult.error) throw genresResult.error;
    if (userFavoritesResult.error) throw userFavoritesResult.error;
    favoritesResult = userFavoritesResult;

    const rows = (titleResult.data || []).map(({ movie_title_genres, movie_telegram_favorites, ...title }) => title);
    const decoratedTitles = await decorateTitles(supabase, rows);
    cached = {
      titles: decoratedTitles,
      genres: genresResult.data || [],
      total: titleResult.count ?? offset + rows.length,
      expiresAt: now + CATALOG_CACHE_TTL_MS
    };
    catalogCache.set(cacheKey, cached);
    if (catalogCache.size > 150) {
      for (const [key, value] of catalogCache) if (value.expiresAt <= now) catalogCache.delete(key);
      while (catalogCache.size > 150) catalogCache.delete(catalogCache.keys().next().value);
    }
  }

  if (!favoritesResult) favoritesResult = await favoritesPromise;
  if (favoritesResult.error) throw favoritesResult.error;
  const favoriteIds = (favoritesResult.data || []).map((row) => row.title_id);
  const favoriteSet = new Set(favoriteIds);
  const titles = cached.titles.map((title) => ({ ...title, is_favorite: favoriteSet.has(title.id) }));
  const nextOffset = offset + titles.length;

  return json({
    ok: true,
    titles,
    favorite_ids: favoriteIds,
    genres: cached.genres,
    pagination: {
      limit,
      offset,
      total: cached.total,
      next_offset: nextOffset,
      has_more: nextOffset < cached.total
    }
  });
}

async function getTitleDetails(env, userId, titleId, includeFullPlot = false) {
  if (!UUID_RE.test(titleId || "")) return json({ ok: false, error: "INVALID_TITLE_ID" }, 400);
  const supabase = getSupabase(env);
  const now = Date.now();
  const favoritePromise = supabase.from("movie_telegram_favorites")
    .select("title_id").eq("telegram_user_id", userId).eq("title_id", titleId).maybeSingle();
  let favoriteResult;
  let cached = detailsCache.get(titleId);

  if (!cached || cached.expiresAt <= now) {
    const [titleResult, genreResult, rightsResult, mediaResult, providerResult, seasonResult, userFavoriteResult] = await Promise.all([
      supabase.from("movie_titles")
        .select("id,title,original_title,media_type,release_year,release_date,runtime_minutes,rating,overview,full_plot_summary,poster_path,backdrop_path")
        .eq("id", titleId).eq("status", "active").maybeSingle(),
      supabase.from("movie_title_genres").select("movie_genres(name,slug)").eq("title_id", titleId),
      supabase.from("movie_distribution_rights").select("status").eq("title_id", titleId).maybeSingle(),
      supabase.from("movie_media_assets").select("id,file_id,media_type").eq("title_id", titleId).eq("status", "active").limit(10),
      supabase.from("movie_provider_availability").select("provider,region_code,availability_type,provider_url").eq("title_id", titleId).eq("is_active", true),
      supabase.from("movie_seasons").select("id,season_number,name,overview,air_date,episode_count,poster_path")
        .eq("title_id", titleId).eq("status", "active").order("season_number", { ascending: true }),
      favoritePromise
    ]);
    for (const result of [titleResult, genreResult, rightsResult, mediaResult, providerResult, seasonResult, userFavoriteResult]) if (result.error) throw result.error;
    favoriteResult = userFavoriteResult;
    const title = titleResult.data;
    if (!title) return json({ ok: false, error: "TITLE_NOT_FOUND" }, 404);

    let seasons = seasonResult.data || [];
    if (title.media_type === "series" && seasons.length) {
      const { data: episodes, error: episodeError } = await supabase.from("movie_episodes")
        .select("id,season_id,episode_number,name,overview,air_date,runtime_minutes,still_path")
        .in("season_id", seasons.map((season) => season.id)).eq("status", "active")
        .order("episode_number", { ascending: true });
      if (episodeError) throw episodeError;
      seasons = seasons.map((season) => ({ ...season, episodes: (episodes || []).filter((episode) => episode.season_id === season.id) }));
    }

    const watchAvailable = rightsResult.data?.status === "authorized" && (mediaResult.data || []).some((asset) => asset.file_id && ["video", "document"].includes(asset.media_type));
    const username = watchAvailable ? await getWatchBotUsername(supabase) : "";
    const watchUrl = watchAvailable && /^[a-zA-Z0-9_]{5,32}$/.test(username)
      ? "https://t.me/" + username + "?start=movie_" + titleId + "_watch"
      : null;

    cached = {
      title: {
        ...Object.fromEntries(Object.entries(title).filter(([key]) => key !== "full_plot_summary")),
        has_full_plot_summary: Boolean(title.full_plot_summary),
        genres: (genreResult.data || []).map((row) => row.movie_genres?.name).filter(Boolean),
        watch_available: Boolean(watchUrl),
        watch_url: watchUrl,
        providers: (providerResult.data || []).map((row) => ({
          provider: row.provider,
          region_code: row.region_code,
          availability_type: row.availability_type,
          provider_url: safeProviderUrl(row.provider_url)
        })).filter((row) => row.provider_url)
      },
      fullPlotSummary: title.full_plot_summary || null,
      seasons,
      expiresAt: now + DETAILS_CACHE_TTL_MS
    };
    detailsCache.set(titleId, cached);
    if (detailsCache.size > 300) {
      for (const [key, value] of detailsCache) if (value.expiresAt <= now) detailsCache.delete(key);
      while (detailsCache.size > 300) detailsCache.delete(detailsCache.keys().next().value);
    }
  }

  if (!favoriteResult) favoriteResult = await favoritePromise;
  if (favoriteResult.error) throw favoriteResult.error;

  return json({
    ok: true,
    title: {
      ...cached.title,
      is_favorite: Boolean(favoriteResult.data),
      ...(includeFullPlot ? { full_plot_summary: cached.fullPlotSummary } : {})
    },
    seasons: cached.seasons
  });
}


async function getMovieShare(env,userId,body,requestUrl){
 const titleId=String(body?.title_id||""),platform=String(body?.platform||"");
 if(!UUID_RE.test(titleId)||!["facebook","whatsapp","x","telegram","instagram","link","copy_caption"].includes(platform))return json({ok:false,error:"INVALID_SHARE_REQUEST"},400);
 const db=getSupabase(env);
 const [titleR,botR,genreR,userR]=await Promise.all([
  db.from("movie_titles").select("id,status,title,overview,release_year,runtime_minutes,rating,poster_path,backdrop_path,media_type").eq("id",titleId).eq("status","active").maybeSingle(),
  db.from("bots").select("id,telegram_username").eq("slug","findly").eq("is_active",true).maybeSingle(),
  db.from("movie_title_genres").select("movie_genres(name)").eq("title_id",titleId),
  db.from("telegram_users").select("id").eq("telegram_user_id",userId).maybeSingle()
 ]);
 for(const r of [titleR,botR,genreR,userR])if(r.error)throw r.error;
 if(!titleR.data)return json({ok:false,error:"TITLE_NOT_FOUND"},404);
 if(!botR.data?.telegram_username)return json({ok:false,error:"MASTER_BOT_UNAVAILABLE"},503);
 const movie={...titleR.data,genres:(genreR.data||[]).map(x=>x.movie_genres?.name).filter(Boolean)};
 const share=buildMovieShareContent(movie,botR.data.telegram_username,platform,"https://findly-bottelegram.pages.dev");
 const {error}=await db.from("analytics_events").insert({user_id:userR.data?.id||null,bot_id:botR.data.id,event_type:"movie_share",event_data:{title_id:titleId,title:movie.title,platform,source:"miniapp"}});
 if(error)console.error("FINDLY movie share analytics failed:",error.code||error.message);
 return json({ok:true,...share});
}


async function getMiniAppAdsConfig(env) {
  const { data, error } = await getSupabase(env)
    .from("system_settings")
    .select("ads_enabled, ads_provider_order, ads_frequency_policy")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  const allowedProviders = new Set(["monetag", "adsgram"]);
  const requestedOrder = Array.isArray(data?.ads_provider_order) ? data.ads_provider_order : ["monetag", "adsgram"];
  const providerOrder = [...new Set(requestedOrder.filter((provider) => allowedProviders.has(provider)))];
  const policy = data?.ads_frequency_policy && typeof data.ads_frequency_policy === "object"
    ? data.ads_frequency_policy
    : {};
  return json({
    ok: true,
    config: {
      ads_enabled: data?.ads_enabled === true,
      // No provider SDK or rendering is shipped in Phase 1.
      sdk_enabled: env.MINIAPP_AD_SDK_ENABLED === "true",
      provider_order: providerOrder.length ? providerOrder : ["monetag", "adsgram"],
      frequency: {
        max_per_session: 1,
        min_interval_minutes: Number.isInteger(policy.min_interval_minutes) && policy.min_interval_minutes >= 10 && policy.min_interval_minutes <= 1440 ? policy.min_interval_minutes : 10,
        detail_views_before_interstitial: Number.isInteger(policy.detail_views_before_interstitial) && policy.detail_views_before_interstitial >= 3 && policy.detail_views_before_interstitial <= 20 ? policy.detail_views_before_interstitial : 3
      },
      slots: {
        catalog_after_sixth: true,
        details_banner: true
      }
    }
  });
}

async function trackMiniAppAdEvent(env, userId, body) {
  const configResponse = await getMiniAppAdsConfig(env);
  const config = await configResponse.json();
  if (!config.config?.ads_enabled || !config.config?.sdk_enabled) {
    return json({ ok: false, error: "ADS_DISABLED" }, 403);
  }
  const provider = String(body.provider || "");
  const slotKey = String(body.slot_key || "");
  const eventType = String(body.event_type || "");
  const eventId = String(body.event_id || "");
  if (!["monetag", "adsgram"].includes(provider)
    || !["catalog_after_sixth", "details_banner"].includes(slotKey)
    || !["impression", "click"].includes(eventType)
    || !UUID_RE.test(eventId)) {
    return json({ ok: false, error: "INVALID_AD_EVENT" }, 400);
  }
  const db = getSupabase(env);
  const [userResult, botResult] = await Promise.all([
    db.from("telegram_users").select("id").eq("telegram_user_id", userId).maybeSingle(),
    db.from("bots").select("id").eq("slug", "findly").eq("is_active", true).maybeSingle()
  ]);
  if (userResult.error) throw userResult.error;
  if (botResult.error) throw botResult.error;
  const titleId = UUID_RE.test(body.title_id || "") ? body.title_id : null;
  const { error } = await db.from("miniapp_ad_events").insert({
    idempotency_key: eventId,
    user_id: userResult.data?.id || null,
    title_id: titleId,
    provider,
    slot_key: slotKey,
    event_type: eventType,
    metadata: { source: "miniapp" }
  });
  if (error && error.code !== "23505") throw error;
  return json({ ok: true, duplicate: error?.code === "23505" });
}

export async function handleMiniAppRoute(env, request, url) {
  const match = url.pathname.match(/^\/api\/miniapp\/(catalog|details|favorite|share|ads\/config|ads\/track)$/);
  if (!match) return null;
  if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 16384) return json({ ok: false, error: "REQUEST_TOO_LARGE" }, 413);
    body = JSON.parse(raw || "{}");
  } catch {
    return json({ ok: false, error: "INVALID_JSON" }, 400);
  }

  try {
    const auth = await authenticate(env, body);
    if (auth.error) return json({ ok: false, error: auth.error }, auth.status);
    if (match[1] === "ads/config") return await getMiniAppAdsConfig(env);
    if (match[1] === "ads/track") return await trackMiniAppAdEvent(env, auth.userId, body);
    if (match[1] === "catalog") return await getCatalog(env, auth.userId, body);
    if (match[1] === "details") return await getTitleDetails(env, auth.userId, body.title_id, body.include_full_plot === true);
    if (match[1] === "share") return await getMovieShare(env, auth.userId, body, request.url);
    if (match[1] === "favorite") {
      if (!UUID_RE.test(body.title_id || "") || !["add", "remove"].includes(body.action)) {
        return json({ ok: false, error: "INVALID_FAVORITE_REQUEST" }, 400);
      }
      const supabase = getSupabase(env);
      const { data: title, error: titleError } = await supabase.from("movie_titles")
        .select("id").eq("id", body.title_id).eq("status", "active").maybeSingle();
      if (titleError) throw titleError;
      if (!title) return json({ ok: false, error: "TITLE_NOT_FOUND" }, 404);
      if (body.action === "add") {
        const { error } = await supabase.from("movie_telegram_favorites")
          .upsert({ telegram_user_id: auth.userId, title_id: body.title_id }, { onConflict: "telegram_user_id,title_id", ignoreDuplicates: true });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("movie_telegram_favorites")
          .delete().eq("telegram_user_id", auth.userId).eq("title_id", body.title_id);
        if (error) throw error;
      }
      return json({ ok: true, is_favorite: body.action === "add" });
    }
  } catch (error) {
    console.error("FINDLY_MINIAPP_REQUEST_FAILED", {
      path: url.pathname,
      code: error?.code || null,
      type: error?.name || "Error"
    });
    return json({ ok: false, error: "MINIAPP_REQUEST_FAILED" }, 500);
  }
  return json({ ok: false, error: "NOT_FOUND" }, 404);
}
