import { getSupabase } from "../lib/supabase.js";

const FIELDS =
  "id, bot_id, category_id, content_type, title, description, image_url, external_url, metadata, is_active, published_at, created_at, updated_at";

function cleanText(value) {
  return typeof value === "string"
    ? value.trim()
    : value;
}

function normalizeContent(body = {}) {
  const item = {
    bot_id: body.bot_id,
    category_id:
      body.category_id || null,
    content_type:
      cleanText(body.content_type) ||
      "general",
    title: cleanText(body.title),
    description:
      cleanText(body.description) ||
      null,
    image_url:
      cleanText(body.image_url) ||
      null,
    external_url:
      cleanText(body.external_url) ||
      null,
    metadata:
      body.metadata &&
      typeof body.metadata === "object"
        ? body.metadata
        : {},
    is_active:
      typeof body.is_active === "boolean"
        ? body.is_active
        : true,
    published_at:
      body.published_at || null
  };

  if (!item.bot_id) {
    throw new Error("bot_id is required");
  }

  if (!item.title) {
    throw new Error("Content title is required");
  }

  return item;
}

export async function getContent(
  env,
  botSlug = null,
  categorySlug = null
) {
  const supabase = getSupabase(env);

  let query = supabase
    .from("content_items")
    .select(FIELDS)
    .order("published_at", {
      ascending: false,
      nullsFirst: false
    })
    .order("created_at", {
      ascending: false
    });

  if (botSlug) {
    const { data: bot, error } =
      await supabase
        .from("bots")
        .select("id")
        .eq("slug", botSlug)
        .single();

    if (error) {
      throw error;
    }

    query = query.eq(
      "bot_id",
      bot.id
    );
  }

  if (categorySlug) {
    const { data: category, error } =
      await supabase
        .from("categories")
        .select("id")
        .eq("slug", categorySlug)
        .single();

    if (error) {
      throw error;
    }

    query = query.eq(
      "category_id",
      category.id
    );
  }

  const { data, error } =
    await query;

  if (error) {
    throw error;
  }

  return data || [];
}

export async function createContent(
  env,
  body
) {
  const supabase = getSupabase(env);

  const item =
    normalizeContent(body);

  const { data, error } =
    await supabase
      .from("content_items")
      .insert(item)
      .select(FIELDS)
      .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateContent(
  env,
  id,
  body
) {
  const supabase = getSupabase(env);

  if (!id) {
    throw new Error(
      "Content id is required"
    );
  }

  const allowed = [
    "bot_id",
    "category_id",
    "content_type",
    "title",
    "description",
    "image_url",
    "external_url",
    "metadata",
    "is_active",
    "published_at"
  ];

  const updates = {};

  for (const key of allowed) {
    if (body[key] !== undefined) {
      updates[key] = body[key];
    }
  }

  if (
    updates.title !== undefined
  ) {
    updates.title =
      cleanText(updates.title);

    if (!updates.title) {
      throw new Error(
        "Content title cannot be empty"
      );
    }
  }

  for (const key of [
    "description",
    "image_url",
    "external_url"
  ]) {
    if (updates[key] !== undefined) {
      updates[key] =
        cleanText(updates[key]) ||
        null;
    }
  }

  if (
    updates.content_type !==
    undefined
  ) {
    updates.content_type =
      cleanText(
        updates.content_type
      ) || "general";
  }

  if (
    Object.keys(updates).length === 0
  ) {
    throw new Error(
      "No fields to update"
    );
  }

  const { data, error } =
    await supabase
      .from("content_items")
      .update(updates)
      .eq("id", id)
      .select(FIELDS)
      .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteContent(
  env,
  id
) {
  return updateContent(
    env,
    id,
    {
      is_active: false
    }
  );
}


// FINDLY Movies catalog administration. All writes run through the
// authenticated Worker using its service-role Supabase client.
const MOVIE_FIELDS = "id,media_type,title,original_title,normalized_title,overview,release_date,release_year,runtime_minutes,rating,poster_path,backdrop_path,status,metadata_status,created_at,updated_at";

function normalizeMovie(body = {}, partial = false) {
  const item = {};
  const allowed = ["media_type", "title", "original_title", "overview", "release_date", "release_year", "runtime_minutes", "rating", "poster_path", "backdrop_path", "status", "metadata_status"];
  for (const key of allowed) {
    if (body[key] !== undefined || !partial && ["media_type", "title"].includes(key)) {
      item[key] = body[key] === "" ? null : body[key];
    }
  }
  if (item.title !== undefined) {
    if (typeof item.title !== "string" || !item.title.trim()) throw new Error("Movie title is required");
    item.title = item.title.trim().slice(0, 200);
    item.normalized_title = item.title.toLocaleLowerCase().normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^\\p{L}\\p{N}]+/gu, " ").trim();
  }
  if (item.media_type !== undefined && !["movie", "series"].includes(item.media_type)) throw new Error("media_type must be movie or series");
  if (item.status !== undefined && !["draft", "active", "inactive"].includes(item.status)) throw new Error("Invalid catalog status");
  if (item.metadata_status !== undefined && !["metadata_only", "provider_available", "authorized_media_available", "delivery_blocked"].includes(item.metadata_status)) throw new Error("Invalid metadata status");
  if (item.rating !== undefined && item.rating !== null && (!Number.isFinite(Number(item.rating)) || Number(item.rating) < 0 || Number(item.rating) > 10)) throw new Error("Rating must be between 0 and 10");
  for (const key of ["release_year", "runtime_minutes"]) {
    if (item[key] !== undefined && item[key] !== null) {
      item[key] = Number(item[key]);
      if (!Number.isInteger(item[key]) || item[key] < 1) throw new Error("Invalid " + key);
    }
  }
  if (item.rating !== undefined && item.rating !== null) item.rating = Number(item.rating);
  for (const key of ["original_title", "overview", "release_date", "poster_path", "backdrop_path"]) {
    if (item[key] !== undefined && typeof item[key] === "string") item[key] = item[key].trim() || null;
  }
  return item;
}

export async function getMoviesCatalog(env, status = null) {
  let query = getSupabase(env).from("movie_titles").select(MOVIE_FIELDS).order("updated_at", { ascending: false }).limit(500);
  if (status && ["draft", "active", "inactive"].includes(status)) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createMovieCatalogItem(env, body) {
  const item = normalizeMovie(body);
  if (!item.media_type || !item.title) throw new Error("media_type and title are required");
  const { data, error } = await getSupabase(env).from("movie_titles").insert(item).select(MOVIE_FIELDS).single();
  if (error) throw error;
  return data;
}

export async function updateMovieCatalogItem(env, id, body) {
  if (!id) throw new Error("Movie id is required");
  const updates = normalizeMovie(body, true);
  if (!Object.keys(updates).length) throw new Error("No fields to update");
  const { data, error } = await getSupabase(env).from("movie_titles").update(updates).eq("id", id).select(MOVIE_FIELDS).single();
  if (error) throw error;
  return data;
}

export async function deleteMovieCatalogItem(env, id) {
  if (!id) throw new Error("Movie id is required");
  const { data, error } = await getSupabase(env).from("movie_titles").delete().eq("id", id).select("id").single();
  if (error) throw error;
  return data;
}
