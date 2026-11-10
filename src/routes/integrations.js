import { getSupabase } from "../lib/supabase.js";
import { telegramRequest } from "../lib/telegram.js";

function statusOf(ok, label) {
  return { status: ok ? "connected" : "error", label };
}

export async function getIntegrationStatuses(env) {
  const checkedAt = new Date().toISOString();
  const results = {
    checked_at: checkedAt,
    worker: { status: "healthy", label: "Worker is serving this request", checked_at: checkedAt },
    supabase: { status: "checking", label: "Checking database", checked_at: checkedAt },
    tmdb: { status: "checking", label: "Checking TMDB", checked_at: checkedAt },
    telegram_master: { status: "checking", label: "Checking Master Bot", checked_at: checkedAt },
    telegram_watch: { status: "checking", label: "Checking Watch Bot", checked_at: checkedAt }
  };

  const dbCheck = (async () => {
    try {
      const { error } = await getSupabase(env).from("bots").select("id").limit(1);
      if (error) throw error;
      results.supabase = { ...statusOf(true, "Database query succeeded"), checked_at: checkedAt };
    } catch {
      results.supabase = { ...statusOf(false, "Database query failed"), checked_at: checkedAt };
    }
  })();

  const tmdbCheck = (async () => {
    if (!env.TMDB_API_KEY) {
      results.tmdb = { ...statusOf(false, "TMDB API key is not configured"), checked_at: checkedAt };
      return;
    }
    if (env.TMDB_NONCOMMERCIAL_DEVELOPMENT !== "true" && env.TMDB_COMMERCIAL_LICENSE_APPROVED !== "true") {
      results.tmdb = { status: "disabled", label: "TMDB access is disabled by the current licensing gate", checked_at: checkedAt };
      return;
    }
    try {
      const response = await fetch("https://api.themoviedb.org/3/configuration", {
        headers: { Authorization: "Bearer " + env.TMDB_API_KEY, Accept: "application/json" },
        signal: AbortSignal.timeout(6000)
      });
      results.tmdb = {
        ...statusOf(response.ok, response.ok ? "TMDB API responded successfully" : "TMDB API returned HTTP " + response.status),
        checked_at: checkedAt
      };
    } catch {
      results.tmdb = { ...statusOf(false, "TMDB API request failed or timed out"), checked_at: checkedAt };
    }
  })();

  const telegramCheck = async (slug, key) => {
    try {
      const identity = await telegramRequest(env, slug, "getMe");
      results[key] = {
        ...statusOf(Boolean(identity?.is_bot && identity?.id), identity?.username ? "@" + identity.username : "Telegram identity verified"),
        bot_id: identity?.id || null,
        checked_at: checkedAt
      };
    } catch {
      results[key] = { ...statusOf(false, "Telegram getMe failed"), checked_at: checkedAt };
    }
  };

  await Promise.all([dbCheck, tmdbCheck, telegramCheck("findly", "telegram_master"), telegramCheck("movies", "telegram_watch")]);
  return results;
}
