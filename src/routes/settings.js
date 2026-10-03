import { getSupabase } from "../lib/supabase.js";

const SETTINGS_SELECT =
  "id, bot_id, setting_key, setting_value, updated_at";

export async function getSettings(
  env,
  botId = null
) {
  const supabase = getSupabase(env);

  let query = supabase
    .from("bot_settings")
    .select(SETTINGS_SELECT)
    .order("setting_key", {
      ascending: true
    });

  if (botId) {
    query = query.eq(
      "bot_id",
      botId
    );
  }

  const { data, error } =
    await query;

  if (error) {
    throw error;
  }

  return data || [];
}

export async function createSetting(
  env,
  payload
) {
  const supabase = getSupabase(env);

  if (
    !payload?.bot_id ||
    !payload?.setting_key
  ) {
    throw new Error(
      "bot_id and setting_key are required"
    );
  }

  const settingKey =
    String(
      payload.setting_key
    ).trim();

  if (!settingKey) {
    throw new Error(
      "setting_key cannot be empty"
    );
  }

  const { data, error } =
    await supabase
      .from("bot_settings")
      .insert({
        bot_id:
          payload.bot_id,
        setting_key:
          settingKey,
        setting_value:
          payload.setting_value || {}
      })
      .select(
        SETTINGS_SELECT
      )
      .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateSetting(
  env,
  id,
  payload
) {
  const supabase = getSupabase(env);

  if (!id) {
    throw new Error(
      "Setting id is required"
    );
  }

  const updates = {};

  if (
    payload &&
    Object.prototype.hasOwnProperty.call(
      payload,
      "setting_key"
    )
  ) {
    const settingKey =
      String(
        payload.setting_key || ""
      ).trim();

    if (!settingKey) {
      throw new Error(
        "setting_key cannot be empty"
      );
    }

    updates.setting_key =
      settingKey;
  }

  if (
    payload &&
    Object.prototype.hasOwnProperty.call(
      payload,
      "setting_value"
    )
  ) {
    updates.setting_value =
      payload.setting_value || {};
  }

  if (
    Object.keys(updates)
      .length === 0
  ) {
    throw new Error(
      "No supported setting fields to update"
    );
  }

  updates.updated_at =
    new Date().toISOString();

  const { data, error } =
    await supabase
      .from("bot_settings")
      .update(updates)
      .eq("id", id)
      .select(
        SETTINGS_SELECT
      )
      .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteSetting(
  env,
  id
) {
  const supabase = getSupabase(env);

  if (!id) {
    throw new Error(
      "Setting id is required"
    );
  }

  const { data, error } =
    await supabase
      .from("bot_settings")
      .delete()
      .eq("id", id)
      .select("id")
      .single();

  if (error) {
    throw error;
  }

  return {
    deleted: true,
    id: data.id
  };
}
