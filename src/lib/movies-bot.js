import { getSupabase } from "./supabase.js";
import { sendMessage, sendPhoto, answerCallback, telegramRequest } from "./telegram.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MOVIE_PAGE_SIZE = 20;
const SEARCH_PROMPT = "🔎 بحث FINDLY Movies";
const YEAR_PROMPT = "📅 سنة إصدار FINDLY";

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
    if (!query || !Number.isInteger(page) || page < 0) return null;
    return { action, page, query };
  }
  if (action === "genre") {
    const genreSlug = parts[2] || "";
    const page = Number(parts[3] || 0);
    if (!/^[a-z0-9-]{1,40}$/.test(genreSlug) || !Number.isInteger(page) || page < 0) return null;
    return { action, genreSlug, page };
  }
  if (action === "year") {
    const year = Number(parts[2]);
    const page = Number(parts[3] || 0);
    if (!Number.isInteger(year) || year < 1888 || year > 2200 || !Number.isInteger(page) || page < 0) return null;
    return { action, year, page };
  }
  if (["home", "library", "categories", "yearprompt", "new", "old", "top", "az", "films", "series", "favorites", "search", "help"].includes(action)) {
    const page = Number(parts[2] || 0);
    return { action, page: Number.isInteger(page) && page >= 0 ? page : 0 };
  }
  if (["title", "favorite", "seasons", "plot"].includes(action) && UUID_RE.test(parts[2] || "")) {
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


export function buildTitleCaption(title) {
  const titleText = Array.from(String(title.title || "بدون عنوان")).slice(0, 240).join("");
  const headingText = "🎬 " + titleText + (title.release_year ? " · " + title.release_year : "") + " · FINDLY Movies";
  const metaText = [
    title.media_type === "series" ? "📺 مسلسل" : "🎞️ فيلم",
    title.runtime_minutes ? "⏱️ " + title.runtime_minutes + " دقيقة" : null,
    title.rating != null ? "⭐ " + Number(title.rating).toFixed(1) + "/10" : null
  ].filter(Boolean).join("  ·  ");
  const genres = Array.isArray(title.genres) ? title.genres.filter(Boolean).join("، ") : "";
  const genreText = genres ? "🎭 التصنيف: " + Array.from(genres).slice(0, 180).join("") : "";
  const notice = title.metadata_status === "authorized_media_available"
    ? "المحتوى مسجل كمتاح بترخيص، لكن التسليم داخل Telegram لم يتم تفعيله بعد."
    : "المشاهدة داخل FINDLY غير متاحة حالياً. لا نعرض روابط غير موثوقة أو محتوى غير مرخّص.";
  const prefixText = headingText + "\n" + metaText + (genreText ? "\n" + genreText : "") + "\n──────────────\n";
  const suffixText = "\n\nℹ️ " + notice;
  const limit = Math.max(0, 1024 - prefixText.length - suffixText.length);
  const overview = String(title.overview || "لا يتوفر ملخص لهذا العنوان حالياً.");
  let shortOverview = "";
  let used = 0;
  for (const character of overview) {
    if (used + character.length > limit) break;
    shortOverview += character;
    used += character.length;
  }
  if (used < overview.length) {
    while (shortOverview.length + 1 > limit) shortOverview = Array.from(shortOverview).slice(0, -1).join("");
    if (limit > 0) shortOverview += "…";
  }
  return "<b>" + escapeHtml(headingText) + "</b>\n" +
    escapeHtml(metaText) + (genreText ? "\n" + escapeHtml(genreText) : "") +
    "\n──────────────\n" + escapeHtml(shortOverview) +
    "\n\n<i>" + escapeHtml("ℹ️ " + notice) + "</i>";
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
      { text: "📚 المكتبة", callback_data: "movies:library:0" },
      { text: "🗂️ التصنيفات", callback_data: "movies:categories" }
    ],
    [
      { text: "🆕 الأحدث", callback_data: "movies:new:0" },
      { text: "⭐ الأعلى تقييماً", callback_data: "movies:top:0" }
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

async function sendMoviesCategories(env, bot, chatId) {
  const { data, error } = await getSupabase(env)
    .from("movie_genres")
    .select("name,slug")
    .order("name", { ascending: true })
    .limit(60);
  if (error) throw error;
  const keyboard = [];
  const genres = data || [];
  for (let index = 0; index < genres.length; index += 2) {
    keyboard.push(genres.slice(index, index + 2).map((genre) => ({
      text: genre.name,
      callback_data: "movies:genre:" + genre.slug + ":0"
    })));
  }
  keyboard.push([{ text: "📚 المكتبة كاملة", callback_data: "movies:library:0" }]);
  keyboard.push([{ text: "🏠 القائمة الرئيسية", callback_data: "movies:home" }]);
  await sendMessage(
    env,
    bot.slug,
    chatId,
    "<b>🗂️ تصنيفات FINDLY</b>\n\nاختار النوع اللي بغيتي، وغادي تشوف الأفلام والمسلسلات المنشورة فيه.",
    { reply_markup: { inline_keyboard: keyboard } }
  );
}

async function showMoviesYearPrompt(env, bot, chatId) {
  await sendMessage(
    env,
    bot.slug,
    chatId,
    "<b>" + YEAR_PROMPT + "</b>\nجاوب على هاد الرسالة بسنة الإصدار، مثال: 2024.",
    { reply_markup: { force_reply: { force_reply: true, selective: true, input_field_placeholder: "مثلاً 2024" } } }
  );
}

async function sendList(env, bot, chatId, action, page = 0, searchTerm = "", genreSlug = "") {
  const supabase = getSupabase(env);
  let query = supabase
    .from("movie_titles")
    .select("id,title,original_title,media_type,release_year,release_date,rating,overview,metadata_status", { count: "exact" })
    .eq("status", "active");

  if (action === "films") query = query.eq("media_type", "movie");
  if (action === "series") query = query.eq("media_type", "series");
  if (action === "year") query = query.eq("release_year", Number(searchTerm));
  if (action === "genre") {
    const { data: genre, error: genreError } = await supabase
      .from("movie_genres")
      .select("id,name")
      .eq("slug", genreSlug)
      .maybeSingle();
    if (genreError) throw genreError;
    if (!genre) {
      await sendMessage(env, bot.slug, chatId, "هاد التصنيف ما بقاش متاح.");
      return;
    }
    const { data: links, error: linksError } = await supabase
      .from("movie_title_genres")
      .select("title_id")
      .eq("genre_id", genre.id)
      .limit(1000);
    if (linksError) throw linksError;
    const titleIds = (links || []).map((link) => link.title_id);
    if (titleIds.length) query = query.in("id", titleIds);
    else query = query.eq("id", "00000000-0000-0000-0000-000000000000");
  }

  if (searchTerm && action === "search") {
    const safe = searchTerm.replace(/[%_*]/g, " ").trim();
    query = query.ilike("normalized_title", "%" + safe + "%");
  }

  if (action === "top") query = query.order("rating", { ascending: false, nullsFirst: false });
  else if (action === "old") query = query.order("release_date", { ascending: true, nullsFirst: false });
  else if (action === "az") query = query.order("title", { ascending: true });
  else query = query.order("release_date", { ascending: false, nullsFirst: false });

  const from = page * MOVIE_PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + MOVIE_PAGE_SIZE - 1);
  if (error) throw error;
  const total = count || 0;
  const pageCount = Math.max(1, Math.ceil(total / MOVIE_PAGE_SIZE));

  const heading = action === "search"
    ? "نتائج البحث عن: " + escapeHtml(searchTerm)
    : action === "genre" ? "تصنيف: " + escapeHtml(genreSlug.replaceAll("-", " "))
      : action === "year" ? "إصدارات سنة " + escapeHtml(searchTerm)
        : action === "new" || action === "library" ? "المكتبة — الأحدث"
          : action === "old" ? "الأقدم"
            : action === "az" ? "ترتيب حسب الاسم"
              : action === "top" ? "الأعلى تقييماً"
                : action === "films" ? "الأفلام"
                  : action === "series" ? "المسلسلات" : "المكتبة";

  const keyboard = (data || []).map((item) => [titleButton(item)]);
  const pageCallback = (nextPage) => {
    if (action === "search") return "movies:search:" + nextPage + ":" + encodeSearchCallback(searchTerm);
    if (action === "genre") return "movies:genre:" + genreSlug + ":" + nextPage;
    if (action === "year") return "movies:year:" + searchTerm + ":" + nextPage;
    return "movies:" + (action === "library" ? "library" : action) + ":" + nextPage;
  };
  const navigation = [];
  if (page > 0) navigation.push({ text: "⬅️ السابق", callback_data: pageCallback(page - 1) });
  navigation.push({ text: "📄 " + (page + 1) + " / " + pageCount, callback_data: "movies:library:0" });
  if (page + 1 < pageCount) navigation.push({ text: "التالي ➡️", callback_data: pageCallback(page + 1) });
  if (navigation.length) keyboard.push(navigation);

  keyboard.push([
    { text: "الكل", callback_data: "movies:library:0" },
    { text: "🎬 أفلام", callback_data: "movies:films:0" },
    { text: "📺 مسلسلات", callback_data: "movies:series:0" }
  ]);
  keyboard.push([
    { text: "🆕 الأحدث", callback_data: "movies:new:0" },
    { text: "🕰️ الأقدم", callback_data: "movies:old:0" },
    { text: "⭐ التقييم", callback_data: "movies:top:0" },
    { text: "A–Z", callback_data: "movies:az:0" }
  ]);
  keyboard.push([
    { text: "🗂️ التصنيفات", callback_data: "movies:categories" },
    { text: "📅 سنة الإصدار", callback_data: "movies:yearprompt" }
  ]);
  keyboard.push([{ text: "🏠 القائمة الرئيسية", callback_data: "movies:home" }]);

  const body = data?.length
    ? (data || []).map((item, index) =>
        (from + index + 1) + ". <b>" + escapeHtml(item.title) + "</b>" +
        (item.release_year ? " · " + item.release_year : "") +
        " · " + (item.media_type === "series" ? "مسلسل" : "فيلم") +
        (item.rating != null ? " · ⭐ " + Number(item.rating).toFixed(1) : "")
      ).join("\n")
    : "مازال ما تزاد حتى عنوان منشور فهاد الاختيار.";

  const rangeStart = total ? from + 1 : 0;
  const rangeEnd = Math.min(from + (data?.length || 0), total);
  await sendMessage(env, bot.slug, chatId,
    "<b>🎞️ " + heading + "</b>\n" +
    "<i>عرض " + rangeStart + "–" + rangeEnd + " من " + total + "</i>\n\n" + body,
    { reply_markup: { inline_keyboard: keyboard } }
  );
}

export async function sendTitleCard(env, botSlug, chatId, posterPath, caption, options = {}) {
  if (posterPath) {
    return sendPhoto(env, botSlug, chatId, posterPath, { caption, ...options });
  }
  return sendMessage(env, botSlug, chatId, caption, options);
}

async function sendTitle(env, bot, chatId, titleId, telegramUserId = null) {
  if (!UUID_RE.test(titleId || "")) {
    await sendMessage(env, bot.slug, chatId, "المعرف ديال العنوان غير صالح.");
    return;
  }

  const supabase = getSupabase(env);
  const { data: title, error } = await supabase
    .from("movie_titles")
    .select("id,title,original_title,media_type,release_year,release_date,runtime_minutes,rating,overview,full_plot_summary,poster_path,metadata_status")
    .eq("id", titleId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;

  if (!title) {
    await sendMessage(env, bot.slug, chatId, "هاد العنوان ما بقاش متاح.");
    return;
  }

  const { data: genreLinks, error: genreError } = await supabase
    .from("movie_title_genres")
    .select("movie_genres(name)")
    .eq("title_id", title.id);
  if (genreError) throw genreError;
  title.genres = (genreLinks || []).map((link) => link.movie_genres?.name).filter(Boolean);

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

  const keyboard = [];
  if (userId) {
    keyboard.push([{
      text: isFavorite ? "💔 إزالة من مكتبتي" : "❤️ أضف إلى مكتبتي",
      callback_data: "movies:favorite:" + title.id
    }]);
  }
  if (title.full_plot_summary) {
    keyboard.push([{ text: "📖 قراءة الملخص الكامل (حرق الأحداث)", callback_data: "movies:plot:" + title.id }]);
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

  const caption = buildTitleCaption(title);
  await sendTitleCard(env, bot.slug, chatId, title.poster_path, caption, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function sendFullPlotSummary(env, bot, chatId, titleId) {
  const {data:title,error}=await getSupabase(env).from("movie_titles").select("title,full_plot_summary").eq("id",titleId).eq("status","active").maybeSingle();
  if(error)throw error;
  if(!title?.full_plot_summary){await sendMessage(env,bot.slug,chatId,"الملخص المفصل غير متوفر حالياً.");return;}
  const chunks=[];let remaining=String(title.full_plot_summary).trim();
  while(remaining.length>3500){let splitAt=remaining.lastIndexOf(" ",3500);if(splitAt<1800)splitAt=3500;chunks.push(remaining.slice(0,splitAt));remaining=remaining.slice(splitAt).trimStart();}
  if(remaining)chunks.push(remaining);
  for(let i=0;i<chunks.length;i++){const heading=i===0?"<b>📖 الملخص الكامل: "+escapeHtml(title.title)+"</b>\n\n":"<b>📖 تكملة الملخص ("+(i+1)+"/"+chunks.length+")</b>\n\n";await sendMessage(env,bot.slug,chatId,heading+escapeHtml(chunks[i]));}
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

export function isMoviesYearReply(message) {
  return Boolean(message?.reply_to_message?.text?.startsWith(YEAR_PROMPT));
}

export async function handleMoviesText(env, bot, chatId, message, telegramUserId) {
  const raw = normalizeMovieSearch(message?.text);
  if (!raw || raw.startsWith("/")) return false;
  if (isMoviesYearReply(message)) {
    if (!/^\\d{4}$/.test(raw) || Number(raw) < 1888 || Number(raw) > 2200) {
      await sendMessage(env, bot.slug, chatId, "دخل سنة صحيحة بين 1888 و2200، مثال: 2024.");
      return true;
    }
    await sendList(env, bot, chatId, "year", 0, raw);
    return true;
  }
  if (bot.slug !== "movies" && !isMoviesSearchReply(message)) return false;
  await sendList(env, bot, chatId, "search", 0, raw);
  return true;
}

export async function handleMoviesCallback(env, bot, chatId, callbackQuery) {
  if (bot.slug !== "findly" && bot.slug !== "movies") return false;
  const parsed = parseMoviesCallback(callbackQuery?.data);
  if (!parsed) return false;
  await answerCallback(env, bot.slug, callbackQuery.id);
  const telegramUserId = callbackQuery.from?.id;

  if (parsed.action === "home") await showMoviesHome(env, bot, chatId);
  else if (parsed.action === "categories") await sendMoviesCategories(env, bot, chatId);
  else if (parsed.action === "yearprompt") await showMoviesYearPrompt(env, bot, chatId);
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
  else if (parsed.action === "plot") await sendFullPlotSummary(env, bot, chatId, parsed.id);
  else if (parsed.action === "favorite") await toggleFavorite(env, bot, chatId, parsed.id, telegramUserId);
  else if (parsed.action === "seasons") await sendSeasons(env, bot, chatId, parsed.id);
  else if (parsed.action === "season") await sendEpisodes(env, bot, chatId, parsed.id);
  else if (parsed.action === "genre") await sendList(env, bot, chatId, "genre", parsed.page, "", parsed.genreSlug);
  else if (parsed.action === "year") await sendList(env, bot, chatId, "year", parsed.page, String(parsed.year));
  else await sendList(env, bot, chatId, parsed.action, parsed.page, parsed.query || "");

  return true;
}

export function parseMovieStartPayload(startPayload) {
  const match = /^movie_([0-9a-f-]{36})(?:_(facebook|instagram))?$/i.exec(startPayload || "");
  if (!match || !UUID_RE.test(match[1])) return null;
  return { titleId: match[1], source: match[2] ? match[2].toLowerCase() : null };
}

export async function handleMoviesStart(env, bot, chatId, startPayload, telegramUserId) {
  const payload = parseMovieStartPayload(startPayload);
  if (payload) {
    await sendTitle(env, bot, chatId, payload.titleId, telegramUserId);
    return;
  }
  await showMoviesHome(env, bot, chatId);
}
