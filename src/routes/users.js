import { getSupabase } from "../lib/supabase.js";
import { recordAdminMutation } from "../lib/admin-audit.js";

const FIELDS = "id, telegram_user_id, username, first_name, last_name, language_code, is_active, first_seen_at, last_seen_at";

export async function getUsers(env, botId = null) {
  const supabase = getSupabase(env);
  let query = supabase.from("telegram_users").select(FIELDS).order("last_seen_at", { ascending: false });
  if (botId) {
    const { data, error } = await supabase.from("user_bots").select("user_id").eq("bot_id", botId);
    if (error) throw error;
    const userIds = (data || []).map((item) => item.user_id);
    if (!userIds.length) return [];
    query = query.in("id", userIds);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function updateUser(env, id, body, actor) {
  if (!id) throw new Error("User id is required");
  const updates = {};
  if (typeof body?.is_active === "boolean") updates.is_active = body.is_active;
  if (!Object.keys(updates).length) throw new Error("No supported fields to update");
  return recordAdminMutation(env, actor, {
    action: updates.is_active ? "telegram_user.activate" : "telegram_user.deactivate",
    entityType: "telegram_user", entityId: id, operation: "update", payload: updates
  });
}
