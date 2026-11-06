import { getSupabase } from "../lib/supabase.js";
import { recordAdminMutation } from "../lib/admin-audit.js";

const SETTINGS_SELECT = "id, bot_id, setting_key, setting_value, updated_at";

export async function getSettings(env, botId = null) {
  let query = getSupabase(env).from("bot_settings").select(SETTINGS_SELECT).order("setting_key", { ascending: true });
  if (botId) query = query.eq("bot_id", botId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createSetting(env, payload, actor) {
  if (!payload?.bot_id || !payload?.setting_key) throw new Error("bot_id and setting_key are required");
  const settingKey = String(payload.setting_key).trim();
  if (!settingKey) throw new Error("setting_key cannot be empty");
  return recordAdminMutation(env, actor, {
    action: "setting.create", entityType: "setting", operation: "create",
    payload: { bot_id: payload.bot_id, setting_key: settingKey, setting_value: payload.setting_value || {} }
  });
}

export async function updateSetting(env, id, payload, actor) {
  if (!id) throw new Error("Setting id is required");
  const updates = {};
  if (Object.prototype.hasOwnProperty.call(payload || {}, "setting_key")) {
    const settingKey = String(payload.setting_key || "").trim();
    if (!settingKey) throw new Error("setting_key cannot be empty");
    updates.setting_key = settingKey;
  }
  if (Object.prototype.hasOwnProperty.call(payload || {}, "setting_value")) updates.setting_value = payload.setting_value || {};
  if (!Object.keys(updates).length) throw new Error("No supported setting fields to update");
  return recordAdminMutation(env, actor, {
    action: "setting.update", entityType: "setting", entityId: id, operation: "update", payload: updates
  });
}

export async function deleteSetting(env, id, actor) {
  if (!id) throw new Error("Setting id is required");
  const record = await recordAdminMutation(env, actor, {
    action: "setting.delete", entityType: "setting", entityId: id, operation: "delete", payload: {}
  });
  return { deleted: true, id: record.id };
}
