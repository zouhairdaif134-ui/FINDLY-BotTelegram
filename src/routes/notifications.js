import { getSupabase } from "../lib/supabase.js";

const NOTIFICATION_SELECT =
  "id, user_id, bot_id, subscription_type, filters, is_active, created_at, updated_at";

export async function getNotifications(
  env,
  userId = null,
  botId = null
) {
  const supabase = getSupabase(env);

  let query = supabase
    .from("notification_subscriptions")
    .select(NOTIFICATION_SELECT)
    .order("created_at", {
      ascending: false
    });

  if (userId) {
    query = query.eq(
      "user_id",
      userId
    );
  }

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

export async function createNotification(
  env,
  payload
) {
  const supabase = getSupabase(env);

  if (
    !payload?.user_id ||
    !payload?.bot_id ||
    !payload?.subscription_type
  ) {
    throw new Error(
      "user_id, bot_id and subscription_type are required"
    );
  }

  const { data, error } =
    await supabase
      .from(
        "notification_subscriptions"
      )
      .insert({
        user_id:
          payload.user_id,
        bot_id:
          payload.bot_id,
        subscription_type:
          payload.subscription_type,
        filters:
          payload.filters || {},
        is_active:
          payload.is_active !== false
      })
      .select(
        NOTIFICATION_SELECT
      )
      .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateNotification(
  env,
  id,
  payload
) {
  const supabase = getSupabase(env);

  if (!id) {
    throw new Error(
      "Notification id is required"
    );
  }

  const updates = {};

  if (
    payload &&
    Object.prototype.hasOwnProperty.call(
      payload,
      "subscription_type"
    )
  ) {
    if (
      !payload.subscription_type
    ) {
      throw new Error(
        "subscription_type cannot be empty"
      );
    }

    updates.subscription_type =
      payload.subscription_type;
  }

  if (
    payload &&
    Object.prototype.hasOwnProperty.call(
      payload,
      "filters"
    )
  ) {
    updates.filters =
      payload.filters || {};
  }

  if (
    payload &&
    Object.prototype.hasOwnProperty.call(
      payload,
      "is_active"
    )
  ) {
    updates.is_active =
      Boolean(
        payload.is_active
      );
  }

  if (
    Object.keys(updates)
      .length === 0
  ) {
    throw new Error(
      "No supported notification fields to update"
    );
  }

  updates.updated_at =
    new Date().toISOString();

  const { data, error } =
    await supabase
      .from(
        "notification_subscriptions"
      )
      .update(updates)
      .eq("id", id)
      .select(
        NOTIFICATION_SELECT
      )
      .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteNotification(
  env,
  id
) {
  const supabase = getSupabase(env);

  if (!id) {
    throw new Error(
      "Notification id is required"
    );
  }

  const { data, error } =
    await supabase
      .from(
        "notification_subscriptions"
      )
      .update({
        is_active: false,
        updated_at:
          new Date().toISOString()
      })
      .eq("id", id)
      .select(
        "id, is_active"
      )
      .single();

  if (error) {
    throw error;
  }

  return {
    archived: true,
    id: data.id,
    is_active:
      data.is_active
  };
}
