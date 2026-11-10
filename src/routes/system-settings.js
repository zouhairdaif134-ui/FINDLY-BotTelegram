import { getSupabase } from "../lib/supabase.js";
import { recordAdminEvent } from "../lib/admin-audit.js";

const DEFAULTS = Object.freeze({
  id: 1,
  app_name: "FINDLY",
  default_language: "ar",
  timezone: "Africa/Casablanca",
  owner_telegram_user_id: null,
  maintenance_message: "نعتذر، الخدمة متوقفة مؤقتاً بسبب أعمال الصيانة. يرجى المحاولة لاحقاً.",
  master_maintenance_enabled: false,
  watch_maintenance_enabled: false
});

const SELECT = "id, app_name, default_language, timezone, owner_telegram_user_id, maintenance_message, master_maintenance_enabled, watch_maintenance_enabled, updated_at";

function normalizeSettings(row) {
  return {
    ...DEFAULTS,
    ...(row || {}),
    owner_telegram_user_id: row?.owner_telegram_user_id == null
      ? ""
      : String(row.owner_telegram_user_id)
  };
}

export async function getSystemSettings(env) {
  const { data, error } = await getSupabase(env)
    .from("system_settings")
    .select(SELECT)
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return normalizeSettings(data);
}

export function validateSystemSettings(payload = {}) {
  const ownerId = payload.owner_telegram_user_id == null
    ? ""
    : String(payload.owner_telegram_user_id).trim();
  if (ownerId && (!/^\d{1,16}$/.test(ownerId) || BigInt(ownerId) <= 0n || BigInt(ownerId) > 9007199254740991n)) {
    throw new Error("Owner Telegram ID must be a positive numeric Telegram user ID.");
  }

  const maintenanceMessage = String(payload.maintenance_message ?? DEFAULTS.maintenance_message).trim();
  if (!maintenanceMessage || maintenanceMessage.length > 500) {
    throw new Error("Maintenance message must contain 1 to 500 characters.");
  }

  const masterEnabled = Boolean(payload.master_maintenance_enabled);
  const watchEnabled = Boolean(payload.watch_maintenance_enabled);
  if ((masterEnabled || watchEnabled) && !ownerId) {
    throw new Error("Set the owner's Telegram numeric ID before enabling maintenance.");
  }

  return {
    app_name: "FINDLY",
    default_language: "ar",
    timezone: "Africa/Casablanca",
    owner_telegram_user_id: ownerId || null,
    maintenance_message: maintenanceMessage,
    master_maintenance_enabled: masterEnabled,
    watch_maintenance_enabled: watchEnabled
  };
}

export async function updateSystemSettings(env, payload, actor) {
  if (!actor?.userId) throw new Error("Authenticated administrator is required.");
  const updates = validateSystemSettings(payload);
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from("system_settings")
    .upsert({
      id: 1,
      ...updates,
      updated_by: actor.userId,
      updated_at: new Date().toISOString()
    }, { onConflict: "id" })
    .select(SELECT)
    .single();
  if (error) throw error;

  await recordAdminEvent(env, actor, {
    action: "settings.system.update",
    entityType: "system_settings",
    entityId: null,
    details: {
      changed_fields: Object.keys(updates),
      master_maintenance_enabled: updates.master_maintenance_enabled,
      watch_maintenance_enabled: updates.watch_maintenance_enabled
    }
  });

  return normalizeSettings(data);
}

export async function getMaintenanceDecision(env, botSlug, update) {
  const senderId = update?.message?.from?.id
    ?? update?.callback_query?.from?.id
    ?? update?.edited_message?.from?.id
    ?? update?.business_message?.from?.id
    ?? null;

  if (senderId == null) return { maintenance: false, allow: true, reason: "non_user_update" };

  const { data, error } = await getSupabase(env)
    .from("system_settings")
    .select("owner_telegram_user_id, maintenance_message, master_maintenance_enabled, watch_maintenance_enabled")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;

  const isMaster = botSlug === "findly";
  const isWatch = botSlug === "movies";
  const enabled = isMaster
    ? Boolean(data?.master_maintenance_enabled)
    : isWatch
      ? Boolean(data?.watch_maintenance_enabled)
      : false;

  if (!enabled) return { maintenance: false, allow: true, reason: "disabled" };

  const ownerId = data?.owner_telegram_user_id == null
    ? ""
    : String(data.owner_telegram_user_id);
  const isOwner = ownerId !== "" && String(senderId) === ownerId;

  return {
    maintenance: true,
    allow: isOwner,
    isOwner,
    message: data?.maintenance_message || DEFAULTS.maintenance_message
  };
}
