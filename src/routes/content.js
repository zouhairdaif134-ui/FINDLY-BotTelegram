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
const MOVIE_FIELDS = "id,media_type,title,original_title,normalized_title,overview,full_plot_summary,release_date,release_year,runtime_minutes,rating,poster_path,backdrop_path,status,metadata_status,created_at,updated_at";

function normalizeMovie(body = {}, partial = false) {
  const item = {};
  const allowed = ["media_type", "title", "original_title", "overview", "full_plot_summary", "release_date", "release_year", "runtime_minutes", "rating", "poster_path", "backdrop_path", "status", "metadata_status"];
  for (const key of allowed) {
    if (body[key] !== undefined || !partial && ["media_type", "title"].includes(key)) {
      item[key] = body[key] === "" ? null : body[key];
    }
  }
  if (item.title !== undefined) {
    if (typeof item.title !== "string" || !item.title.trim()) throw new Error("Movie title is required");
    item.title = item.title.trim().slice(0, 200);
    item.normalized_title = item.title.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
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
  for (const key of ["original_title", "overview", "full_plot_summary", "release_date", "poster_path", "backdrop_path"]) {
    if (item[key] !== undefined && typeof item[key] === "string") item[key] = item[key].trim() || null;
  }
  return item;
}

export async function getMoviesCatalog(env, status = null) {
  const supabase = getSupabase(env);
  let query = supabase.from("movie_titles").select(MOVIE_FIELDS).order("updated_at", { ascending: false }).limit(500);
  if (status && ["draft", "active", "inactive"].includes(status)) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  const titles = data || [];
  if (!titles.length) return titles;

  const { data: genreLinks, error: genreError } = await supabase
    .from("movie_title_genres")
    .select("title_id,movie_genres(name)")
    .in("title_id", titles.map((title) => title.id));
  if (genreError) throw genreError;

  const genresByTitle = new Map();
  for (const link of genreLinks || []) {
    const name = link.movie_genres?.name;
    if (!name) continue;
    const genres = genresByTitle.get(link.title_id) || [];
    genres.push(name);
    genresByTitle.set(link.title_id, genres);
  }
  return titles.map((title) => ({
    ...title,
    genres: genresByTitle.get(title.id) || []
  }));
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


function tmdbImage(path, size = "w500") {
  return path ? "https://image.tmdb.org/t/p/" + size + path : null;
}

async function tmdbRequest(env, path, params = {}) {
  if (!env.TMDB_API_KEY) {
    const error = new Error("TMDB_API_KEY is not configured on the Worker");
    error.code = "TMDB_NOT_CONFIGURED";
    throw error;
  }
  const url = new URL("https://api.themoviedb.org/3" + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { Authorization: "Bearer " + env.TMDB_API_KEY, Accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.status_message || "TMDB request failed (" + response.status + ")");
    error.code = "TMDB_UPSTREAM_ERROR";
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function searchTmdbCatalog(env, term, mediaType = "movie", page = 1) {
  const query = String(term || "").trim().slice(0, 100);
  if (!query) throw new Error("Search term is required");
  if (!["movie", "series"].includes(mediaType)) throw new Error("Invalid media type");
  const data = await tmdbRequest(env, mediaType === "series" ? "/search/tv" : "/search/movie", {
    query, page: Math.min(5, Math.max(1, Number(page) || 1)), include_adult: false
  });
  return (data.results || []).map((item) => ({
    tmdb_id: item.id,
    media_type: mediaType,
    title: mediaType === "series" ? item.name : item.title,
    original_title: mediaType === "series" ? item.original_name : item.original_title,
    overview: item.overview || "",
    release_date: mediaType === "series" ? item.first_air_date || null : item.release_date || null,
    release_year: Number(String(mediaType === "series" ? item.first_air_date : item.release_date || "").slice(0, 4)) || null,
    rating: Number.isFinite(Number(item.vote_average)) ? Math.round(Number(item.vote_average) * 10) / 10 : null,
    poster_path: tmdbImage(item.poster_path),
    backdrop_path: tmdbImage(item.backdrop_path, "w780"),
    genre_ids: item.genre_ids || [],
    popularity: item.popularity || 0
  }));
}

export async function importTmdbCatalogItem(env, tmdbId, mediaType = "movie") {
  if (!/^\d+$/.test(String(tmdbId))) throw new Error("Invalid TMDB id");
  if (!["movie", "series"].includes(mediaType)) throw new Error("Invalid media type");
  const isSeries = mediaType === "series";
  const details = await tmdbRequest(env, (isSeries ? "/tv/" : "/movie/") + tmdbId, {
    append_to_response: "external_ids"
  });
  const title = isSeries ? details.name : details.title;
  const originalTitle = isSeries ? details.original_name : details.original_title;
  const releaseDate = isSeries ? details.first_air_date : details.release_date;
  const releaseYear = Number(String(releaseDate || "").slice(0, 4)) || null;
  const normalized = String(title || "").toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (!title) throw new Error("TMDB response does not contain a title");
  const supabase = getSupabase(env);
  const { data: existingId, error: lookupError } = await supabase
    .from("movie_external_ids").select("title_id").eq("provider", "tmdb").eq("external_id", String(tmdbId)).maybeSingle();
  if (lookupError) throw lookupError;
  const record = {
    media_type: mediaType, title, original_title: originalTitle || null,
    normalized_title: normalized, overview: details.overview || null,
    release_date: releaseDate || null, release_year: releaseYear,
    runtime_minutes: isSeries ? null : details.runtime || null,
    rating: Number.isFinite(Number(details.vote_average)) ? Math.round(Number(details.vote_average) * 10) / 10 : null,
    poster_path: tmdbImage(details.poster_path), backdrop_path: tmdbImage(details.backdrop_path),
    status: "draft", metadata_status: "metadata_only"
  };
  let saved;
  if (existingId?.title_id) {
    const { data, error } = await supabase.from("movie_titles").update(record).eq("id", existingId.title_id).select(MOVIE_FIELDS).single();
    if (error) throw error;
    saved = data;
  } else {
    const { data, error } = await supabase.from("movie_titles").insert(record).select(MOVIE_FIELDS).single();
    if (error) throw error;
    saved = data;
    const { error: externalError } = await supabase.from("movie_external_ids").insert({
      title_id: saved.id, provider: "tmdb", external_id: String(tmdbId), external_type: mediaType
    });
    if (externalError) throw externalError;
  }
  const genreRows = (details.genres || []).map((genre) => ({
    name: genre.name, slug: "tmdb-" + genre.id, source: "provider", external_id: String(genre.id)
  }));
  for (const genre of genreRows) {
    const { error } = await supabase.from("movie_genres").upsert(genre, { onConflict: "source,external_id" });
    if (error) throw error;
  }
  if (genreRows.length) {
    const ids = genreRows.map((genre) => genre.external_id);
    const { data: genres, error: genreError } = await supabase.from("movie_genres").select("id,external_id").eq("source", "provider").in("external_id", ids);
    if (genreError) throw genreError;
    const links = (genres || []).map((genre) => ({ title_id: saved.id, genre_id: genre.id }));
    const { error: linkError } = await supabase.from("movie_title_genres").upsert(links, { onConflict: "title_id,genre_id" });
    if (linkError) throw linkError;
  }
  return saved;
}
