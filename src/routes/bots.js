import { getSupabase } from "../lib/supabase.js";
import { recordAdminMutation } from "../lib/admin-audit.js";

const FIELDS = "id, name, slug, bot_type, telegram_username, description, icon, is_active, sort_order";

export async function getBots(env) {
  const { data, error } = await getSupabase(env).from("bots").select(FIELDS).order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createBot(env, body, actor) {
  const { name, slug, bot_type, telegram_username, description, icon, is_active, sort_order } = body || {};
  if (!name || !slug || !bot_type) throw new Error("name, slug and bot_type are required");
  const payload = {
    name, slug, bot_type, telegram_username: telegram_username || null,
    description: description || null, icon: icon || null,
    is_active: typeof is_active === "boolean" ? is_active : true,
    sort_order: Number.isFinite(sort_order) ? sort_order : 0
  };
  const record = await recordAdminMutation(env, actor, {
    action: "bot.create", entityType: "bot", operation: "create", payload
  });
  return Object.fromEntries(Object.entries(record).filter(([key]) => FIELDS.split(", ").includes(key)));
}

export async function updateBot(env, id, body, actor) {
  if (!id) throw new Error("Bot id is required");
  const allowed = ["name","slug","bot_type","telegram_username","description","icon","is_active","sort_order"];
  const updates = {};
  for (const key of allowed) if (body?.[key] !== undefined) updates[key] = body[key];
  if (!Object.keys(updates).length) throw new Error("No fields to update");
  const action = updates.is_active === true ? "bot.activate" : updates.is_active === false ? "bot.deactivate" : "bot.update";
  const record = await recordAdminMutation(env, actor, {
    action, entityType: "bot", entityId: id, operation: "update", payload: updates
  });
  return Object.fromEntries(Object.entries(record).filter(([key]) => FIELDS.split(", ").includes(key)));
}

export async function deleteBot(env, id, actor) {
  if (!id) throw new Error("Bot id is required");
  const record = await recordAdminMutation(env, actor, {
    action: "bot.deactivate", entityType: "bot", entityId: id, operation: "update", payload: { is_active: false }
  });
  return { archived: true, id: record.id, is_active: record.is_active };
}
