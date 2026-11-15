import { getSupabase } from "../lib/supabase.js";

export async function getAnalytics(
  env,
  userId = null,
  botId = null,
  eventType = null
) {
  const supabase = getSupabase(env);

  let query = supabase
    .from("analytics_events")
    .select(
      "id, user_id, bot_id, event_type, event_data, created_at"
    )
    .order("created_at", { ascending: false });

  if (userId) {
    query = query.eq("user_id", userId);
  }

  if (botId) {
    query = query.eq("bot_id", botId);
  }

  if (eventType) {
    query = query.eq("event_type", eventType);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data;
}

export async function getMovieReferralAnalytics(env) {
  const { data, error } = await getSupabase(env).rpc(
    "get_movie_referral_analytics"
  );

  if (error) {
    throw error;
  }

  return data || [];
}

export async function getFindlyAnalyticsOverview(env, fromValue = null, toValue = null) {
  const to = toValue ? new Date(toValue) : new Date();
  const from = fromValue
    ? new Date(fromValue)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
    const error = new Error("Analytics period must contain valid ordered ISO dates");
    error.status = 400;
    throw error;
  }

  const { data, error } = await getSupabase(env).rpc(
    "get_findly_analytics_overview",
    {
      p_from: from.toISOString(),
      p_to: to.toISOString()
    }
  );

  if (error) throw error;
  return data || {};
}
