import { getSupabase } from "./supabase.js";
import { sendMessage, answerCallback } from "./telegram.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 8;
const SEARCH_PROMPT = "🔎 بحث FINDLY Movies";

export function normalizeMovieSearch(value) {
  return String(value || "")
    .trim()
    .replace(/[\u0000-\u001f]/g, "")
    .slice(0, 80);
}

export function parseMoviesCallback(value) {
  const parts = String(value || "").split(":");
  if (parts[0] !== "movies") return null;
  const action = parts[1] || "";
  if (["home", "new", "top", "films", "series", "favorites", "search"].includes(action)) {
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
  if (error) throw error;
  return data;
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
    [{ text: "ℹ️ المساعدة", callback_data: "movies:home" }]
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
    .select("id,title,original_title,media_type,release_year,release_date,rating,overview,metadata_status")
    .eq("status", "active");

  if (action === "films") query = query.eq("media_type", "movie");
  if (action === "series") query = query.eq("media_type", "series");
  if (searchTerm) {
    const safe = searchTerm.replace(/[,%()]/g, " ").trim();
    query = query.or(
      "title.ilike.%" + safe + "%,original_title.ilike.%" + safe + "%,normalized_title.ilike.%" + safe + "%"
    );
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

  const keyboard = (data || []).map((item) => [titleButton(item)]);
  if (data?.length === PAGE_SIZE) {
    keyboard.push([{ text: "➡️ المزيد", callback_data: "movies:" + action + ":" + (page + 1) }]);
  }
  keyboard.push([{ text: "🏠 القائمة الرئيسية", callback_data: "movies:home" }]);

  const body = data?.length
    ? (data || []).map((item, index) =>
        (from + index + 1) + ". <b>" + escapeHtml(item.title) + "</b>" +
        (item.release_year ? " · " + item.release_year : "") +
        (item.rating ? " · ⭐ " + Number(item.rating).toFixed(1) : "")
      ).join("\n")
    : "مازال ما تزاد حتى عنوان فهاد الكتالوج. ملي يتربط مصدر البيانات أو يضيف المدير العناوين، غادي تبان هنا.";

  await sendMessage(env, bot.slug, chatId, "<b>🎞️ " + heading + "</b>\n\n" + body, {
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
    .select("id,title,original_title,media_type,release_year,release_date,runtime_minutes,rating,overview,metadata_status")
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
    escapeHtml(title.overview || "لا يتوفر ملخص لهذا العنوان حالياً."),
    "",
    title.metadata_status === "authorized_media_available"
      ? "المحتوى مسجل كمتاح بترخيص، لكن مسار التسليم داخل Telegram لم يتم تفعيله بعد."
      : "المشاهدة داخل FINDLY غير متاحة حالياً. لن نعرض رابطاً غير موثوق أو محتوى غير مرخّص."
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

  await sendMessage(env, bot.slug, chatId, lines.join("\n"), {
    reply_markup: { inline_keyboard: keyboard }
  });
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
  const parsed = parseMoviesCallback(callbackQuery?.data);
  if (!parsed) return false;
  await answerCallback(env, bot.slug, callbackQuery.id);
  const telegramUserId = callbackQuery.from?.id;

  if (parsed.action === "home") await sendHome(env, bot, chatId);
  else if (parsed.action === "search") await showMoviesSearchPrompt(env, bot, chatId);
  else if (parsed.action === "favorites") await sendFavorites(env, bot, chatId, telegramUserId);
  else if (parsed.action === "title") await sendTitle(env, bot, chatId, parsed.id, telegramUserId);
  else if (parsed.action === "favorite") await toggleFavorite(env, bot, chatId, parsed.id, telegramUserId);
  else if (parsed.action === "seasons") await sendSeasons(env, bot, chatId, parsed.id);
  else if (parsed.action === "season") await sendEpisodes(env, bot, chatId, parsed.id);
  else await sendList(env, bot, chatId, parsed.action, parsed.page);

  return true;
}

export async function handleMoviesStart(env, bot, chatId, startPayload, telegramUserId) {
  const match = /^movie_([0-9a-f-]{36})$/i.exec(startPayload || "");
  if (match && UUID_RE.test(match[1])) {
    await sendTitle(env, bot, chatId, match[1], telegramUserId);
    return;
  }
  await sendHome(env, bot, chatId);
}
