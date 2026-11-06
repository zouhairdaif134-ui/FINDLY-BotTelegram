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
