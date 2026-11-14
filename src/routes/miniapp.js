import { getSupabase } from "../lib/supabase.js";
import { getTelegramToken } from "../lib/telegram.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60;

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
  const { data: savedUser, error } = await getSupabase(env).from("telegram_users").upsert({
    telegram_user_id: String(user.id),
    username: user.username || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    language_code: user.language_code || null,
    is_bot: false,
    last_seen_at: new Date().toISOString()
  }, { onConflict: "telegram_user_id" }).select("is_active").single();
  if (error) throw error;
  if (savedUser?.is_active === false) return { error: "USER_ACCESS_DISABLED", status: 403 };
  return { userId: String(user.id) };
}

function safeProviderUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}

async function decorateTitles(supabase, titles, telegramUserId) {
  const ids = (titles || []).map((title) => title.id);
  if (!ids.length) return { titles: [], favoriteIds: [] };

  const [genreResult, rightsResult, mediaResult, favoritesResult] = await Promise.all([
    supabase.from("movie_title_genres").select("title_id,movie_genres(name,slug)").in("title_id", ids),
    supabase.from("movie_distribution_rights").select("title_id,status").in("title_id", ids).eq("status", "authorized"),
    supabase.from("movie_media_assets").select("title_id,id,file_id,media_type").in("title_id", ids).eq("status", "active"),
    supabase.from("movie_telegram_favorites").select("title_id").eq("telegram_user_id", telegramUserId)
  ]);
  for (const result of [genreResult, rightsResult, mediaResult, favoritesResult]) if (result.error) throw result.error;

  const genresByTitle = new Map();
  for (const row of genreResult.data || []) {
    if (!genresByTitle.has(row.title_id)) genresByTitle.set(row.title_id, []);
    if (row.movie_genres?.name) genresByTitle.get(row.title_id).push(row.movie_genres.name);
  }
  const authorized = new Set((rightsResult.data || []).map((row) => row.title_id));
  const hasActiveMedia = new Set((mediaResult.data || []).filter((row) => row.file_id && ["video", "document"].includes(row.media_type)).map((row) => row.title_id));
  const favoriteIds = (favoritesResult.data || []).map((row) => row.title_id);

  return {
    titles: (titles || []).map((title) => ({
      ...title,
      genres: genresByTitle.get(title.id) || [],
      is_favorite: favoriteIds.includes(title.id),
      watch_available: authorized.has(title.id) && hasActiveMedia.has(title.id)
    })),
    favoriteIds
  };
}

async function getCatalog(env, userId, body) {
  const supabase = getSupabase(env);
  let query = supabase.from("movie_titles")
    .select("id,title,original_title,media_type,release_year,release_date,runtime_minutes,rating,overview,poster_path,backdrop_path,created_at")
    .eq("status", "active")
    .limit(200);

  const type = ["movie", "series"].includes(body.media_type) ? body.media_type : null;
  if (type) query = query.eq("media_type", type);
  const search = String(body.query || "").trim().replace(/[\u0000-\u001f%_*]/g, " ").slice(0, 80).trim();
  if (search) query = query.ilike("normalized_title", "%" + search + "%");
  const genre = String(body.genre || "").trim().slice(0, 40);
  if (genre) {
    const { data: genreRow, error: genreError } = await supabase.from("movie_genres")
      .select("id").eq("slug", genre).maybeSingle();
    if (genreError) throw genreError;
    if (!genreRow) return json({ ok: true, titles: [], favorite_ids: [], genres: [] });
    const { data: links, error: linksError } = await supabase.from("movie_title_genres")
      .select("title_id").eq("genre_id", genreRow.id).limit(1000);
    if (linksError) throw linksError;
    const titleIds = (links || []).map((row) => row.title_id);
    if (!titleIds.length) return json({ ok: true, titles: [], favorite_ids: [], genres: [] });
    query = query.in("id", titleIds);
  }

  const sort = body.sort === "top" ? "rating" : body.sort === "release" ? "release_date" : "created_at";
  const { data, error } = await query.order(sort, { ascending: false, nullsFirst: false });
  if (error) throw error;

  const decorated = await decorateTitles(supabase, data || [], userId);
  const { data: genres, error: genresError } = await supabase.from("movie_genres")
    .select("name,slug").order("name", { ascending: true }).limit(80);
  if (genresError) throw genresError;

  return json({
    ok: true,
    titles: decorated.titles,
    favorite_ids: decorated.favoriteIds,
    genres: genres || []
  });
}

async function getTitleDetails(env, userId, titleId) {
  if (!UUID_RE.test(titleId || "")) return json({ ok: false, error: "INVALID_TITLE_ID" }, 400);
  const supabase = getSupabase(env);
  const { data: title, error } = await supabase.from("movie_titles")
    .select("id,title,original_title,media_type,release_year,release_date,runtime_minutes,rating,overview,full_plot_summary,poster_path,backdrop_path")
    .eq("id", titleId).eq("status", "active").maybeSingle();
  if (error) throw error;
  if (!title) return json({ ok: false, error: "TITLE_NOT_FOUND" }, 404);

  const [genreResult, rightsResult, mediaResult, providerResult, favoriteResult] = await Promise.all([
    supabase.from("movie_title_genres").select("movie_genres(name,slug)").eq("title_id", titleId),
    supabase.from("movie_distribution_rights").select("status").eq("title_id", titleId).maybeSingle(),
    supabase.from("movie_media_assets").select("id,file_id,media_type").eq("title_id", titleId).eq("status", "active").limit(10),
    supabase.from("movie_provider_availability").select("provider,region_code,availability_type,provider_url").eq("title_id", titleId).eq("is_active", true),
    supabase.from("movie_telegram_favorites").select("title_id").eq("telegram_user_id", userId).eq("title_id", titleId).maybeSingle()
  ]);
  for (const result of [genreResult, rightsResult, mediaResult, providerResult, favoriteResult]) if (result.error) throw result.error;

  let seasons = [];
  if (title.media_type === "series") {
    const { data, error: seasonError } = await supabase.from("movie_seasons")
      .select("id,season_number,name,overview,air_date,episode_count,poster_path")
      .eq("title_id", titleId).eq("status", "active").order("season_number", { ascending: true });
    if (seasonError) throw seasonError;
    seasons = data || [];
    if (seasons.length) {
      const { data: episodes, error: episodeError } = await supabase.from("movie_episodes")
        .select("id,season_id,episode_number,name,overview,air_date,runtime_minutes,still_path")
        .in("season_id", seasons.map((season) => season.id)).eq("status", "active")
        .order("episode_number", { ascending: true });
      if (episodeError) throw episodeError;
      seasons = seasons.map((season) => ({ ...season, episodes: (episodes || []).filter((episode) => episode.season_id === season.id) }));
    }
  }

  const watchAvailable = rightsResult.data?.status === "authorized" && (mediaResult.data || []).some((asset) => asset.file_id && ["video", "document"].includes(asset.media_type));
  const { data: watchBot, error: botError } = watchAvailable
    ? await supabase.from("bots").select("telegram_username").eq("slug", "movies").eq("is_active", true).maybeSingle()
    : { data: null, error: null };
  if (botError) throw botError;
  const username = String(watchBot?.telegram_username || "").replace(/^@/, "");
  const watchUrl = watchAvailable && /^[a-zA-Z0-9_]{5,32}$/.test(username)
    ? "https://t.me/" + username + "?start=movie_" + titleId + "_watch"
    : null;

  return json({
    ok: true,
    title: {
      ...title,
      genres: (genreResult.data || []).map((row) => row.movie_genres?.name).filter(Boolean),
      is_favorite: Boolean(favoriteResult.data),
      watch_available: Boolean(watchUrl),
      watch_url: watchUrl,
      providers: (providerResult.data || []).map((row) => ({
        provider: row.provider,
        region_code: row.region_code,
        availability_type: row.availability_type,
        provider_url: safeProviderUrl(row.provider_url)
      })).filter((row) => row.provider_url)
    },
    seasons
  });
}

export async function handleMiniAppRoute(env, request, url) {
  const match = url.pathname.match(/^\/api\/miniapp\/(catalog|details|favorite)$/);
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
    if (match[1] === "catalog") return await getCatalog(env, auth.userId, body);
    if (match[1] === "details") return await getTitleDetails(env, auth.userId, body.title_id);
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
