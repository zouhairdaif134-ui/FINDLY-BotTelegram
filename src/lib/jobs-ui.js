import { getSupabase } from "./supabase.js";
import { answerCallback, editMessageText, sendMessage } from "./telegram.js";

const PAGE_SIZE = 5;

function escapeHtml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function truncate(value, max = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function moroccoTodayStartIso() {
  const now = Date.now();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(now));

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  const localAsUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second
  );

  const offsetMs =
    localAsUtc - Math.floor(now / 1000) * 1000;

  return new Date(
    Date.UTC(
      values.year,
      values.month - 1,
      values.day
    ) - offsetMs
  ).toISOString();
}

function formatMoroccoTime(value) {
  if (!value) return "غير متوفر";
  return new Intl.DateTimeFormat("fr-MA", { timeZone: "Africa/Casablanca", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}

async function loadJobStats(env) {
  const supabase = getSupabase(env);
  const todayStart = moroccoTodayStartIso();
  const [active, source] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, first_seen_at", { count: "exact" })
      .eq("status", "active")
      .limit(1000),
    supabase
      .from("job_sources")
      .select("last_success_at")
      .eq("enabled", true)
      .order("last_success_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
  ]);
  if (active.error) throw active.error;
  if (source.error) throw source.error;
  const todayStartMs = new Date(todayStart).getTime();
  const newToday = (active.data || []).filter(
    (job) => job.first_seen_at && new Date(job.first_seen_at).getTime() >= todayStartMs
  ).length;
  return {
    activeCount: Number(active.count || 0),
    newToday,
    lastUpdatedAt: source.data?.last_success_at || null
  };
}

async function loadJobs(env, page = 0, city = null) {
  const supabase = getSupabase(env);
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  let query = supabase.from("jobs").select("id, title, company, location_text, city, description, source_url, first_seen_at, published_at", { count: "exact" }).eq("status", "active").order("first_seen_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).range(from, to);
  if (city) query = query.eq("city", city);
  const { data, count, error } = await query;
  if (error) throw error;
  return { jobs: data || [], total: Number(count || 0) };
}

async function loadCities(env) {
  const { data, error } = await getSupabase(env).from("jobs").select("city").eq("status", "active").not("city", "is", null).order("city", { ascending: true }).limit(100);
  if (error) throw error;
  return [...new Set((data || []).map((row) => row.city).filter(Boolean))];
}

function jobIsNew(job) {
  return Boolean(job.first_seen_at && new Date(job.first_seen_at).getTime() >= new Date(moroccoTodayStartIso()).getTime());
}

function jobSummary(job, index) {
  const lines = ["<b>" + (index + 1) + "️⃣ " + escapeHtml(job.title) + "</b>"];
  lines.push("📍 " + escapeHtml(job.city || job.location_text || "غير محدد"));
  lines.push("🏢 " + escapeHtml(job.company || "ADDWORK"));
  if (jobIsNew(job)) lines.push("🆕 جديد");
  return lines.join("\n");
}

function cityIndex(city, cities) {
  if (!city) return "";
  const index = cities.indexOf(city);
  return index >= 0 ? String(index) : "";
}

function jobsListKeyboard(jobs, page, totalPages, city, cities) {
  const keyboard = [];
  if (jobs.length) keyboard.push(jobs.map((job, index) => ({ text: (index + 1) + "️⃣", callback_data: "jobs:detail:" + job.id + ":" + page + ":" + cityIndex(city, cities) })));
  const nav = [];
  if (page > 0) nav.push({ text: "◀️", callback_data: "jobs:page:" + (page - 1) + ":" + cityIndex(city, cities) });
  nav.push({ text: (page + 1) + "/" + totalPages, callback_data: "jobs:noop" });
  if (page + 1 < totalPages) nav.push({ text: "▶️", callback_data: "jobs:page:" + (page + 1) + ":" + cityIndex(city, cities) });
  keyboard.push(nav);
  keyboard.push([{ text: "🆕 آخر العروض", callback_data: "jobs:latest" }, { text: "📍 حسب المدينة", callback_data: "jobs:cities" }]);
  keyboard.push([{ text: "🔔 نبهني", callback_data: "jobs:interest" }]);
  return keyboard;
}

export async function renderJobsList(env, bot, chatId, messageId, page = 0, city = null) {
  const [stats, result, cities] = await Promise.all([
    loadJobStats(env),
    loadJobs(env, page, city),
    loadCities(env)
  ]);
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  if (safePage !== page) return renderJobsList(env, bot, chatId, messageId, safePage, city);
  const lines = ["<b>💼 فرص الشغل" + (city ? " · " + escapeHtml(city) : "") + "</b>", "", "📊 " + stats.activeCount + " عرض نشط · 🆕 " + stats.newToday + " اليوم", "🕐 آخر تحديث: " + formatMoroccoTime(stats.lastUpdatedAt), ""];
  if (!result.jobs.length) { lines.push("ما كاين حتى عرض نشط فهاد الاختيار."); } else {
    result.jobs.forEach((job, index) => lines.push(jobSummary(job, index), ""));
    lines.push("<i>اختار رقم العرض باش تشوف التفاصيل · " + (safePage + 1) + "/" + totalPages + "</i>");
  }
  const keyboard = jobsListKeyboard(result.jobs, safePage, totalPages, city, cities);
  if (bot.telegram_username) {
    keyboard.push([{
      text: "🏠 FINDLY",
      url: "https://t.me/" + bot.telegram_username.replace(/^@/, "")
    }]);
  }
  await editMessageText(env, bot.slug, chatId, messageId, lines.join("\n"), { reply_markup: { inline_keyboard: keyboard } });
}

async function renderJobDetail(env, bot, chatId, messageId, jobId, page, city) {
  const cities = await loadCities(env);
  const { data: job, error } = await getSupabase(env).from("jobs").select("id, title, company, location_text, city, description, source_url, first_seen_at, published_at").eq("id", jobId).eq("status", "active").maybeSingle();
  if (error) throw error;
  if (!job) { await editMessageText(env, bot.slug, chatId, messageId, "<b>💼 فرص الشغل</b>\n\nهاد العرض ما بقاش متوفر.", { reply_markup: { inline_keyboard: [[{ text: "◀️ الرجوع", callback_data: "jobs:page:" + page + ":" + cityIndex(city, cities) }]] } }); return; }
  const lines = ["<b>" + escapeHtml(job.title) + "</b>", "", "📍 " + escapeHtml(job.city || job.location_text || "غير محدد"), "🏢 " + escapeHtml(job.company || "ADDWORK")];
  if (jobIsNew(job)) lines.push("🆕 جديد");
  const description = truncate(job.description, 900);
  if (description) lines.push("", escapeHtml(description));
  const keyboard = [];
  if (job.source_url) keyboard.push([{ text: "🔗 فتح العرض", url: "https://findly-v3-api.berrchidcity99.workers.dev/jobs/click/" + encodeURIComponent(job.id) }, { text: "📤 شارك", url: "https://t.me/share/url?url=" + encodeURIComponent(job.source_url) + "&text=" + encodeURIComponent(job.title) }]);
  keyboard.push([{ text: "🔔 نبهني", callback_data: "jobs:interest" }]);
  keyboard.push([{ text: "◀️ الرجوع", callback_data: "jobs:page:" + page + ":" + cityIndex(city, cities) }]);
  if (bot.telegram_username) {
    keyboard.push([{
      text: "🏠 FINDLY",
      url: "https://t.me/" + bot.telegram_username.replace(/^@/, "")
    }]);
  }
  await editMessageText(env, bot.slug, chatId, messageId, lines.join("\n"), { reply_markup: { inline_keyboard: keyboard } });
}

export async function showJobsCategory(env, bot, chatId) {
  const sent = await sendMessage(env, bot.slug, chatId, "<b>💼 فرص الشغل</b>\n\nجاري تحميل العروض…");
  await renderJobsList(env, bot, chatId, sent.message_id, 0, null);
}

export async function handleJobsCallback(env, bot, chatId, callbackQuery) {
  const data = callbackQuery.data || "";
  const messageId = callbackQuery.message?.message_id;
  if (!messageId) return;
  if (data === "jobs:noop") { await answerCallback(env, bot.slug, callbackQuery.id); return; }
  if (data === "jobs:latest") { await answerCallback(env, bot.slug, callbackQuery.id); await renderJobsList(env, bot, chatId, messageId, 0, null); return; }
  if (data === "jobs:cities") {
    await answerCallback(env, bot.slug, callbackQuery.id);
    const cities = await loadCities(env);
    const keyboard = cities.map((city, index) => [
      {
        text: "📍 " + city,
        callback_data: "jobs:city:" + index
      }
    ]);
    keyboard.push([{ text: "◀️ آخر العروض", callback_data: "jobs:latest" }]);
    await editMessageText(env, bot.slug, chatId, messageId, "<b>📍 حسب المدينة</b>\n\nاختار المدينة:", { reply_markup: { inline_keyboard: keyboard } });
    return;
  }
  if (data.startsWith("jobs:city:")) {
    await answerCallback(env, bot.slug, callbackQuery.id);
    const cityIndexValue = Number(data.slice("jobs:city:".length));
    const cities = await loadCities(env);
    const city =
      Number.isInteger(cityIndexValue) && cityIndexValue >= 0
        ? cities[cityIndexValue] || null
        : null;
    await renderJobsList(env, bot, chatId, messageId, 0, city);
    return;
  }
  if (data.startsWith("jobs:page:")) {
    await answerCallback(env, bot.slug, callbackQuery.id);
    const parts = data.split(":");
    const page = Number(parts[2]);
    const cityIndexValue = parts[3] === "" ? -1 : Number(parts[3]);
    const cities = await loadCities(env);
    const city =
      Number.isInteger(cityIndexValue) && cityIndexValue >= 0
        ? cities[cityIndexValue] || null
        : null;
    await renderJobsList(
      env,
      bot,
      chatId,
      messageId,
      Number.isInteger(page) ? page : 0,
      city
    );
    return;
  }
  if (data.startsWith("jobs:detail:")) {
    await answerCallback(env, bot.slug, callbackQuery.id);
    const parts = data.split(":");
    const jobId = parts[2];
    const page = Number(parts[3]) || 0;
    const cityIndexValue = parts[4] === "" ? -1 : Number(parts[4]);
    const cities = await loadCities(env);
    const city =
      Number.isInteger(cityIndexValue) && cityIndexValue >= 0
        ? cities[cityIndexValue] || null
        : null;
    await renderJobDetail(env, bot, chatId, messageId, jobId, page, city);
    return;
  }
  if (data === "jobs:interest") {
    await answerCallback(env, bot.slug, callbackQuery.id, "سجلنا الاهتمام");
    await recordJobInterest(env, bot, callbackQuery.from);
    await editMessageText(env, bot.slug, chatId, messageId, "<b>🔔 تنبيهات فرص الشغل</b>\n\nسجلنا اهتمامك. ملي يتفعل نظام التنبيهات الحقيقية غادي نعلموك.", { reply_markup: { inline_keyboard: [[{ text: "◀️ فرص الشغل", callback_data: "jobs:latest" }]] } });
  }
}

async function recordJobInterest(env, bot, telegramUser) {
  if (!telegramUser?.id) return;
  const supabase = getSupabase(env);
  const { data: user } = await supabase.from("telegram_users").select("id").eq("telegram_user_id", String(telegramUser.id)).maybeSingle();
  const { error } = await supabase.from("analytics_events").insert({ user_id: user?.id || null, bot_id: bot.id, event_type: "jobs_notifications_interest", event_data: { source: "telegram_jobs_ui" } });
  if (error) console.error("Jobs notification interest analytics failed:", error);
}