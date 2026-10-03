import { getSupabase } from "../lib/supabase.js";

export async function getBots(env) {
  const supabase = getSupabase(env);

  const { data, error } = await supabase
    .from("bots")
    .select(
      "id, name, slug, bot_type, telegram_username, description, icon, is_active, sort_order"
    )
    .order("sort_order", { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

export async function createBot(env, body) {
  const supabase = getSupabase(env);

  const {
    name,
    slug,
    bot_type,
    telegram_username,
    description,
    icon,
    is_active,
    sort_order
  } = body;

  if (!name || !slug || !bot_type) {
    throw new Error(
      "name, slug and bot_type are required"
    );
  }

  const { data, error } = await supabase
    .from("bots")
    .insert({
      name,
      slug,
      bot_type,
      telegram_username:
        telegram_username || null,
      description:
        description || null,
      icon: icon || null,
      is_active:
        typeof is_active === "boolean"
          ? is_active
          : true,
      sort_order:
        Number.isFinite(sort_order)
          ? sort_order
          : 0
    })
    .select(
      "id, name, slug, bot_type, telegram_username, description, icon, is_active, sort_order"
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateBot(env, id, body) {
  const supabase = getSupabase(env);

  if (!id) {
    throw new Error("Bot id is required");
  }

  const allowed = [
    "name",
    "slug",
    "bot_type",
    "telegram_username",
    "description",
    "icon",
    "is_active",
    "sort_order"
  ];

  const updates = {};

  for (const key of allowed) {
    if (body[key] !== undefined) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new Error("No fields to update");
  }

  const { data, error } = await supabase
    .from("bots")
    .update(updates)
    .eq("id", id)
    .select(
      "id, name, slug, bot_type, telegram_username, description, icon, is_active, sort_order"
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteBot(env, id) {
  const supabase = getSupabase(env);

  if (!id) {
    throw new Error("Bot id is required");
  }

  const { data, error } = await supabase
    .from("bots")
    .update({
      is_active: false
    })
    .eq("id", id)
    .select("id, is_active")
    .single();

  if (error) {
    throw error;
  }

  return {
    archived: true,
    id: data.id,
    is_active: data.is_active
  };
}
