import { getSupabase } from "./supabase.js";
import { sendMessage, sendPhoto, sendVideo, answerCallback, telegramRequest } from "./telegram.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 8;
const SEARCH_PROMPT = "🔎 بحث FINDLY Movies";

export function normalizeMovieSearch(value) {
  return String(value || "")
    .trim()
    .replace(/[\u0000-\u001f]/g, "")
    .slice(0, 80);
}

function encodeSearchCallback(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeSearchCallback(value) {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return normalizeMovieSearch(new TextDecoder().decode(bytes));
  } catch {
    return "";
  }
}

export function parseMoviesCallback(value) {
  const parts = String(value || "").split(":");
  if (parts[0] !== "movies") return null;
  const action = parts[1] || "";
  if (action === "search" && parts[3]) {
    const page = Number(parts[2]);
    const query = decodeSearchCallback(parts.slice(3).join(":"));
    if (!query || !Number.isInteger(page) || page < 1) return null;
    return { action, page, query };
  }
  if (["home", "new", "top", "films", "series", "favorites", "search", "help"].includes(action)) {
    const page = Number(parts[2] || 0);
    return { action, page: Number.isInteger(page) && page >= 0 ? page : 0 };
  }
  if (["title", "favorite", "seasons"].includes(action) && UUID_RE.test(parts[2] || "")) {
    return { action, id: parts[2] };
  }
  if (action === "season" && UUID_RE.test(parts[2] || "")) {
    return { action, id: parts[2] };
  }
  return null;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function getMoviesBot(env) {
  const { data, error } = await getSupabase(env)
    .from("bots")
    .select("telegram_username")
    .eq("slug", "movies")
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data?.telegram_username) return null;
  try {
    const identity = await telegramRequest(env, "movies", "getMe");
    const configuredUsername = data.telegram_username.replace(/^@/, "").toLowerCase();
    if (!identity?.username || identity.username.toLowerCase() !== configuredUsername) return null;
    return data;
  } catch {
    return null;
  }
}

async function getMasterBot(env) {
  const { data, error } = await getSupabase(env)
    .from("bots")
    .select("telegram_username")
    .eq("slug", "findly")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getInternalUserId(env, telegramUserId) {
  if (!telegramUserId) return null;
  const { data, error } = await getSupabase(env)
    .from("telegram_users")
    .select("id")
    .eq("telegram_user_id", String(telegramUserId))
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

function titleButton(title) {
  const year = title.release_year ? " (" + title.release_year + ")" : "";
  const kind = title.media_type === "series" ? "مسلسل" : "فيلم";
  return {
    text: (title.rating ? "⭐ " + Number(title.rating).toFixed(1) + " · " : "") +
      kind + " · " + title.title + year,
    callback_data: "movies:title:" + title.id
  };
}

export async function showMoviesHome(env, bot, chatId) {
  const keyboard = [
    [
      { text: "🆕 الإصدارات الجديدة", callback_data: "movies:new:0" },
      { text: "⭐ الأعلى تقييماً", callback_data: "movies:top:0" }
    ],
    [
      { text: "🎬 الأفلام", callback_data: "movies:films:0" },
      { text: "📺 المسلسلات", callback_data: "movies:series:0" }
    ],
    [
      { text: "🔎 البحث", callback_data: "movies:search" },
      { text: "❤️ مكتبتي", callback_data: "movies:favorites:0" }
    ],
    [{ text: "ℹ️ المساعدة", callback_data: "movies:help" }]
  ];

  if (bot.slug === "findly") {
    const moviesBot = await getMoviesBot(env);
    const username = moviesBot?.telegram_username?.replace(/^@/, "");
    if (username) keyboard.push([{ text: "▶️ افتح FINDLY Movies", url: "https://t.me/" + username }]);
  } else {
    const master = await getMasterBot(env);
    const username = master?.telegram_username?.replace(/^@/, "");
    if (username) keyboard.push([{ text: "🏠 FINDLY الرئيسي", url: "https://t.me/" + username }]);
  }

  await sendMessage(
    env,
    bot.slug,
    chatId,
    "<b>🎬 FINDLY Movies</b>\n\n" +
      (bot.slug === "findly"
        ? "اكتشف الأفلام والمسلسلات، وشوف التفاصيل والتقييمات قبل المشاهدة."
        : "مكتبة FINDLY للأفلام والمسلسلات. اختار الخدمة اللي بغيتي."),
    { reply_markup: { inline_keyboard: keyboard } }
  );
}

async function sendList(env, bot, chatId, action, page = 0, searchTerm = "") {
  const supabase = getSupabase(env);
  let query = supabase
    .from("movie_titles")
    .select("id,title,original_title,media_type,release_year,release_date,rating,overview,poster_path,metadata_status")
    .eq("status", "active");

  if (action === "films") query = query.eq("media_type", "movie");
  if (action === "series") query = query.eq("media_type", "series");
  if (searchTerm) {
    const safe = searchTerm.replace(/[%_*]/g, " ").trim();
    query = query.ilike("normalized_title", "%" + safe + "%");
  } else if (action === "top") {
    query = query.order("rating", { ascending: false, nullsFirst: false });
  } else {
    query = query.order("release_date", { ascending: false, nullsFirst: false });
  }

  const from = page * PAGE_SIZE;
  const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) throw error;

  const heading = searchTerm
    ? "نتائج البحث عن: " + escapeHtml(searchTerm)
    : action === "new" ? "الإصدارات الجديدة"
      : action === "top" ? "الأعلى تقييماً"
        : action === "films" ? "الأفلام"
          : action === "series" ? "المسلسلات" : "الكتالوج";

  if (!data?.length) {
    await sendMessage(env, bot.slug, chatId,
      "<b>🎞️ " + heading + "</b>\n\nمازال ما تزاد حتى عنوان نشط فهاد الكتالوج.");
    return;
  }

  let moviesBot = null;
  if (bot.slug === "findly") moviesBot = await getMoviesBot(env);
  const moviesUsername = moviesBot?.telegram_username?.replace(/^@/, "");
  const titleIds = data.map((item) => item.id);
  const { data: genreLinks, error: genreError } = await supabase
    .from("movie_title_genres").select("title_id,movie_genres(name)")
    .in("title_id", titleIds);
  if (genreError) throw genreError;
  const genresByTitle = new Map();
  for (const link of genreLinks || []) {
    const name = link.movie_genres?.name;
    if (!name) continue;
    if (!genresByTitle.has(link.title_id)) genresByTitle.set(link.title_id, []);
    genresByTitle.get(link.title_id).push(name);
  }

  await sendMessage(env, bot.slug, chatId, "<b>🎞️ " + heading + "</b>");
  for (const item of data) {
    const lines = [
      "<b>" + escapeHtml(item.title) + "</b>",
      [item.release_year, item.media_type === "series" ? "مسلسل" : "فيلم", item.rating != null ? "⭐ " + Number(item.rating).toFixed(1) + "/10" : null].filter(Boolean).join(" · "),
      (genresByTitle.get(item.id) || []).join("، ") ? "🎭 " + escapeHtml((genresByTitle.get(item.id) || []).join("، ")) : null,
      "",
      escapeHtml(String(item.overview || "لا يتوفر ملخص لهذا العنوان حالياً.").slice(0, 650))
    ].filter((line) => line !== null);
    const keyboard = [];
    if (bot.slug === "findly" && moviesUsername) {
      keyboard.push([{ text: "▶️ مشاهدة الفيلم", url: "https://t.me/" + moviesUsername + "?start=movie_" + item.id }]);
    } else {
      keyboard.push([{ text: "▶️ عرض التفاصيل / المشاهدة", callback_data: "movies:title:" + item.id }]);
    }
    const caption = lines.join("\n").slice(0, 1000);
    if (item.poster_path) {
      await sendPhoto(env, bot.slug, chatId, item.poster_path, {
        caption, parse_mode: "HTML",
        reply_markup: { inline_keyboard: keyboard }
      });
    } else {
      await sendMessage(env, bot.slug, chatId, caption, {
        reply_markup: { inline_keyboard: keyboard }
      });
    }
  }

  const keyboard = [];
  if (data.length === PAGE_SIZE) {
    const callbackData = action === "search"
      ? "movies:search:" + (page + 1) + ":" + encodeSearchCallback(searchTerm)
      : "movies:" + action + ":" + (page + 1);
    if (callbackData.length <= 64) keyboard.push([{ text: "➡️ المزيد", callback_data: callbackData }]);
  }
  keyboard.push([{ text: "🏠 القائمة الرئيسية", callback_data: "movies:home" }]);
  await sendMessage(env, bot.slug, chatId, "التنقل بين الكتالوغ:", {
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function sendTitle(env, bot, chatId, titleId, telegramUserId = null) {
  if (!UUID_RE.test(titleId || "")) {
    await sendMessage(env, bot.slug, chatId, "المعرف ديال العنوان غير صالح.");
    return;
  }

  const supabase = getSupabase(env);
  const { data: title, error } = await supabase
    .from("movie_titles")
    .select("id,title,original_title,media_type,release_year,release_date,runtime_minutes,rating,overview,poster_path,metadata_status")
    .eq("id", titleId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;

  if (!title) {
    await sendMessage(env, bot.slug, chatId, "هاد العنوان ما بقاش متاح.");
    return;
  }

  const userId = await getInternalUserId(env, telegramUserId);
  let isFavorite = false;
  if (userId) {
    const { data: favorite, error: favoriteError } = await supabase
      .from("movie_favorites")
      .select("title_id")
      .eq("user_id", userId)
      .eq("title_id", title.id)
      .maybeSingle();
    if (favoriteError) throw favoriteError;
    isFavorite = Boolean(favorite);
  }

  const lines = [
    "<b>" + escapeHtml(title.title) + "</b>",
    [title.release_year, title.media_type === "series" ? "مسلسل" : "فيلم", title.runtime_minutes ? title.runtime_minutes + " دقيقة" : null].filter(Boolean).join(" · "),
    title.rating != null ? "⭐ " + Number(title.rating).toFixed(1) + "/10" : null,
    "",
    escapeHtml(title.overview || "لا يتوفر ملخص لهذا العنوان حالياً.")
  ].filter((line) => line !== null);

  const keyboard = [];
  if (userId) {
    keyboard.push([{
      text: isFavorite ? "💔 إزالة من مكتبتي" : "❤️ أضف إلى مكتبتي",
      callback_data: "movies:favorite:" + title.id
    }]);
  }
  if (title.media_type === "series") {
    keyboard.push([{ text: "📚 المواسم والحلقات", callback_data: "movies:seasons:" + title.id }]);
  }
  if (bot.slug === "findly") {
    const moviesBot = await getMoviesBot(env);
    const username = moviesBot?.telegram_username?.replace(/^@/, "");
    if (username) {
      keyboard.push([{
        text: "▶️ فتح في FINDLY Movies",
        url: "https://t.me/" + username + "?start=movie_" + title.id
      }]);
    }
  }
  keyboard.push([{ text: "⬅️ رجوع للقائمة", callback_data: "movies:home" }]);

  const caption = lines.join("\n").slice(0, 1000);
  if (title.poster_path) {
    await sendPhoto(env, bot.slug, chatId, title.poster_path, {
      caption,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard }
    });
  } else {
    await sendMessage(env, bot.slug, chatId, caption, {
      reply_markup: { inline_keyboard: keyboard }
    });
  }
}

async function toggleFavorite(env, bot, chatId, titleId, telegramUserId) {
  const userId = await getInternalUserId(env, telegramUserId);
  if (!userId) {
    await sendMessage(env, bot.slug, chatId, "تعذر تحديد حسابك. أرسل /start ثم حاول مرة أخرى.");
    return;
  }
  const supabase = getSupabase(env);
  const { data: existing, error: lookupError } = await supabase
    .from("movie_favorites")
    .select("title_id")
    .eq("user_id", userId)
    .eq("title_id", titleId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing) {
    const { error } = await supabase.from("movie_favorites")
      .delete().eq("user_id", userId).eq("title_id", titleId);
    if (error) throw error;
    await sendMessage(env, bot.slug, chatId, "تمت إزالة العنوان من مكتبتك.");
  } else {
    const { error } = await supabase.from("movie_favorites")
      .insert({ user_id: userId, title_id: titleId });
    if (error) throw error;
    await sendMessage(env, bot.slug, chatId, "تمت إضافة العنوان إلى مكتبتك.");
  }
  await sendTitle(env, bot, chatId, titleId, telegramUserId);
}

async function sendFavorites(env, bot, chatId, telegramUserId) {
  const userId = await getInternalUserId(env, telegramUserId);
  if (!userId) {
    await sendMessage(env, bot.slug, chatId, "أرسل /start أولاً باش نربط مكتبتك بحساب Telegram.");
    return;
  }
  const supabase = getSupabase(env);
  const { data: favorites, error } = await supabase
    .from("movie_favorites")
    .select("title_id,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;

  if (!favorites?.length) {
    await sendMessage(env, bot.slug, chatId, "مكتبتك مازال خاوية. اختار عنوان وزيدو للمفضلة.");
    return;
  }
  const ids = favorites.map((item) => item.title_id);
  const { data: titles, error: titlesError } = await supabase
    .from("movie_titles")
    .select("id,title,media_type,release_year,rating")
    .in("id", ids)
    .eq("status", "active");
  if (titlesError) throw titlesError;
  const byId = new Map((titles || []).map((item) => [item.id, item]));
  const keyboard = ids.map((id) => byId.get(id)).filter(Boolean).map((item) => [titleButton(item)]);
  keyboard.push([{ text: "🏠 القائمة الرئيسية", callback_data: "movies:home" }]);
  await sendMessage(env, bot.slug, chatId, "<b>❤️ مكتبتي</b>\n\nاختار عنواناً لعرض التفاصيل:", {
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function sendSeasons(env, bot, chatId, titleId) {
  const supabase = getSupabase(env);
  const { data: seasons, error } = await supabase
    .from("movie_seasons")
    .select("id,season_number,name,episode_count")
    .eq("title_id", titleId)
    .eq("status", "active")
    .order("season_number", { ascending: true });
  if (error) throw error;
  if (!seasons?.length) {
    await sendMessage(env, bot.slug, chatId, "مازال ما تسجلوش المواسم ديال هاد المسلسل.");
    return;
  }
  const keyboard = seasons.map((season) => [{
    text: "الموسم " + season.season_number + (season.episode_count != null ? " · " + season.episode_count + " حلقة" : ""),
    callback_data: "movies:season:" + season.id
  }]);
  keyboard.push([{ text: "⬅️ رجوع", callback_data: "movies:home" }]);
  await sendMessage(env, bot.slug, chatId, "<b>📚 المواسم</b>\n\nاختار الموسم:", {
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function sendEpisodes(env, bot, chatId, seasonId) {
  const supabase = getSupabase(env);
  const { data: episodes, error } = await supabase
    .from("movie_episodes")
    .select("episode_number,name,overview,runtime_minutes,status")
    .eq("season_id", seasonId)
    .eq("status", "active")
    .order("episode_number", { ascending: true })
    .limit(50);
  if (error) throw error;
  const lines = (episodes || []).map((episode) =>
    "<b>" + episode.episode_number + ". " + escapeHtml(episode.name || ("الحلقة " + episode.episode_number)) + "</b>" +
    (episode.runtime_minutes ? " · " + episode.runtime_minutes + " دقيقة" : "") +
    (episode.overview ? "\n" + escapeHtml(episode.overview) : "")
  );
  await sendMessage(env, bot.slug, chatId,
    "<b>🎞️ الحلقات</b>\n\n" + (lines.length ? lines.join("\n\n") : "مازال ما تسجلات حتى حلقة نشطة."),
    { reply_markup: { inline_keyboard: [[{ text: "🏠 القائمة الرئيسية", callback_data: "movies:home" }]] } }
  );
}

export async function showMoviesSearchPrompt(env, bot, chatId) {
  await sendMessage(env, bot.slug, chatId,
    "<b>" + SEARCH_PROMPT + "</b>\nصيفط اسم الفيلم أو المسلسل فجواب على هاد الرسالة.",
    { reply_markup: { force_reply: { force_reply: true, selective: true, input_field_placeholder: "اسم الفيلم أو المسلسل" } } }
  );
}

export function isMoviesSearchReply(message) {
  return Boolean(message?.reply_to_message?.text?.startsWith(SEARCH_PROMPT));
}

export async function handleMoviesText(env, bot, chatId, message, telegramUserId) {
  const term = normalizeMovieSearch(message?.text);
  if (!term || term.startsWith("/")) return false;
  if (bot.slug !== "movies" && !isMoviesSearchReply(message)) return false;
  await sendList(env, bot, chatId, "search", 0, term);
  return true;
}

export async function handleMoviesCallback(env, bot, chatId, callbackQuery) {
  if (bot.slug !== "findly" && bot.slug !== "movies") return false;
  const parsed = parseMoviesCallback(callbackQuery?.data);
  if (!parsed) return false;
  await answerCallback(env, bot.slug, callbackQuery.id);
  const telegramUserId = callbackQuery.from?.id;

  if (parsed.action === "home") await showMoviesHome(env, bot, chatId);
  else if (parsed.action === "help") {
    await sendMessage(env, bot.slug, chatId,
      "<b>ℹ️ مساعدة FINDLY Movies</b>\n\n" +
      "• اختار الإصدارات الجديدة أو الأعلى تقييماً للتصفح.\n" +
      "• استعمل البحث باسم الفيلم أو المسلسل.\n" +
      "• افتح أي عنوان لعرض التفاصيل وإضافته للمكتبة.\n" +
      "• المسلسلات تعرض المواسم والحلقات المسجلة.\n\n" +
      "المشاهدة داخل Telegram لا تتفعل إلا للمحتوى المرخّص والمجهز للتسليم."
    );
  }
  else if (parsed.action === "search") await showMoviesSearchPrompt(env, bot, chatId);
  else if (parsed.action === "favorites") await sendFavorites(env, bot, chatId, telegramUserId);
  else if (parsed.action === "title") await sendTitle(env, bot, chatId, parsed.id, telegramUserId);
  else if (parsed.action === "favorite") await toggleFavorite(env, bot, chatId, parsed.id, telegramUserId);
  else if (parsed.action === "seasons") await sendSeasons(env, bot, chatId, parsed.id);
  else if (parsed.action === "season") await sendEpisodes(env, bot, chatId, parsed.id);
  else await sendList(env, bot, chatId, parsed.action, parsed.page, parsed.query || "");

  return true;
}

export async function handleMoviesStart(env, bot, chatId, startPayload, telegramUserId) {
  const match = /^movie_([0-9a-f-]{36})$/i.exec(startPayload || "");
  if (match && UUID_RE.test(match[1])) {
    const supabase = getSupabase(env);
    const { data: title, error } = await supabase.from("movie_titles")
      .select("id,title,status,metadata_status")
      .eq("id", match[1]).eq("status", "active").maybeSingle();
    if (error) throw error;
    if (!title) {
      await sendMessage(env, bot.slug, chatId, "هاد الفيلم ما بقاش متاح.");
      return;
    }
    const { data: asset, error: assetError } = await supabase.from("movie_media_assets")
      .select("telegram_file_id,rights_status,is_active")
      .eq("title_id", title.id).eq("is_active", true).maybeSingle();
    if (assetError) throw assetError;
    if (asset?.telegram_file_id && asset.rights_status === "authorized") {
      await sendVideo(env, bot.slug, chatId, asset.telegram_file_id, {
        caption: "🎬 <b>" + escapeHtml(title.title) + "</b>\nمشاهدة داخل Telegram"
      });
      return;
    }
    await sendMessage(env, bot.slug, chatId,
      "الفيديو ديال <b>" + escapeHtml(title.title) + "</b> مازال ما تجهزش للمشاهدة أو الترخيص ديالو ما تأكدش."
    );
    await sendTitle(env, bot, chatId, match[1], telegramUserId);
    return;
  }
  await showMoviesHome(env, bot, chatId);
}


export function parseMovieVideoUploadCaption(value) {
  const match = /^\/attachmovie\s+([0-9a-f-]{36})\s+(\S{3,200})$/i.exec(String(value || "").trim());
  if (!match || !UUID_RE.test(match[1])) return null;
  return { titleId: match[1], rightsReference: match[2] };
}

// Admin uploads an authorized candidate video directly to the Movies Bot.
// Caption format: /attachmovie <movie_uuid> <rights_reference>
export async function handleMovieVideoUpload(env, bot, message) {
  if (bot.slug !== "movies" || !message?.video) return false;
  const allowed = String(env.TELEGRAM_MOVIES_ADMIN_IDS || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const senderId = String(message.from?.id || "");
  if (!senderId || !allowed.includes(senderId)) return false;

  const upload = parseMovieVideoUploadCaption(message.caption);
  if (!upload) {
    await sendMessage(env, bot.slug, message.chat.id,
      "صيغة رفع الفيديو غير صحيحة. استعمل:\n/attachmovie <movie_id> <rights_reference>");
    return true;
  }

  const supabase = getSupabase(env);
  const { data: title, error: titleError } = await supabase.from("movie_titles")
    .select("id,title").eq("id", upload.titleId).maybeSingle();
  if (titleError) throw titleError;
  if (!title) {
    await sendMessage(env, bot.slug, message.chat.id, "ما لقيتش الفيلم بهذا المعرّف.");
    return true;
  }

  const { error } = await supabase.from("movie_media_assets").upsert({
    title_id: title.id,
    telegram_file_id: message.video.file_id,
    telegram_file_unique_id: message.video.file_unique_id || null,
    media_kind: "video",
    quality: message.video.width && message.video.height ? message.video.width + "x" + message.video.height : null,
    rights_status: "pending",
    rights_reference: upload.rightsReference,
    is_active: true,
    uploaded_by_telegram_user_id: senderId
  }, { onConflict: "title_id" });
  if (error) throw error;

  await sendMessage(env, bot.slug, message.chat.id,
    "تسجل الفيديو ديال <b>" + escapeHtml(title.title) + "</b> بنجاح، ولكن بقى فحالة انتظار التحقق من حقوق التوزيع. ما غاديش يتبعت للمستخدمين حتى يتصادق عليه المدير من Dashboard.");
  return true;
}
