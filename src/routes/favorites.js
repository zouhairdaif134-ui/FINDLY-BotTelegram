import { getSupabase } from "../lib/supabase.js";

const FAVORITE_SELECT =
  "id, user_id, content_id, created_at";

export async function getFavorites(
  env,
  userId = null
) {
  const supabase = getSupabase(env);

  let query = supabase
    .from("favorites")
    .select(FAVORITE_SELECT)
    .order("created_at", {
      ascending: false
    });

  if (userId) {
    query = query.eq(
      "user_id",
      userId
    );
  }

  const { data, error } =
    await query;

  if (error) {
    throw error;
  }

  return data || [];
}

export async function createFavorite(
  env,
  payload
) {
  const supabase = getSupabase(env);

  if (
    !payload?.user_id ||
    !payload?.content_id
  ) {
    throw new Error(
      "user_id and content_id are required"
    );
  }

  const { data, error } =
    await supabase
      .from("favorites")
      .insert({
        user_id:
          payload.user_id,
        content_id:
          payload.content_id
      })
      .select(
        FAVORITE_SELECT
      )
      .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteFavorite(
  env,
  id
) {
  const supabase = getSupabase(env);

  if (!id) {
    throw new Error(
      "Favorite id is required"
    );
  }

  const { data, error } =
    await supabase
      .from("favorites")
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
