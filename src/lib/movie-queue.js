import { getSupabase } from "./supabase.js";
import { searchTmdbCatalog, importTmdbCatalogItem, assertTmdbAccessAllowed } from "../routes/content.js";

const ACTIVE_DUPLICATE_STATES = ["pending", "processing", "resolving", "needs_review", "ready_for_review", "already_in_catalog"];
const MAX_BATCH_SIZE = 100;

export function isMovieQueueProcessingEnabled(env) {
  return env?.TMDB_COMMERCIAL_LICENSE_APPROVED === "true" ||
    env?.TMDB_NONCOMMERCIAL_DEVELOPMENT === "true";
}

export function normalizeMovieQueueTitle(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function parseMovieQueueLines(value) {
  const lines = String(value || "").split(/\r?\n/);
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    const match = line.match(/^(MOVIE|TV)\s*\|\s*(.+)$/i);
    if (!match || !match[2].trim()) {
      throw new Error(`Line ${index + 1}: Each line must start with MOVIE | or TV | followed by a title`);
    }
    entries.push({
      title: match[2].trim(),
      media_type: match[1].toUpperCase() === "TV" ? "series" : "movie"
    });
  }
  return entries;
}

export function selectTmdbQueueMatch(results, submittedTitle) {
  const candidates = Array.isArray(results) ? results : [];
  const normalizedQuery = normalizeMovieQueueTitle(submittedTitle);
  const exactMatches = candidates.filter((candidate) =>
    normalizeMovieQueueTitle(candidate?.title) === normalizedQuery ||
    normalizeMovieQueueTitle(candidate?.original_title) === normalizedQuery
  );
  return exactMatches.length === 1 ? exactMatches[0] : null;
}

function safeError(error) {
  return {
    code: String(error?.code || error?.name || "MOVIE_QUEUE_PROCESSING_FAILED").slice(0, 80),
    message: String(error?.message || "Unknown processing error").slice(0, 500)
  };
}

export async function listMovieQueue(env, status = null) {
  const supabase = getSupabase(env);
  let query = supabase
    .from("movie_queue_items")
    .select("id,submitted_title,normalized_title,media_type,status,tmdb_id,tmdb_candidates,catalog_title_id,attempt_count,next_attempt_at,last_error_code,last_error_message,created_at,updated_at,processed_at")
    .order("created_at", { ascending: true }).order("id", { ascending: true })
    .limit(300);
  if (status && ["pending", "processing", "resolving", "needs_review", "ready_for_review", "already_in_catalog", "failed", "rejected", "published"].includes(status)) {
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function enqueueMovieQueue(env, body, actor) {
  const requestedType = body?.media_type || "movie";
  if (!["movie", "series", "mixed"].includes(requestedType)) {
    throw new Error("media_type must be movie, series, or mixed");
  }

  const entries = requestedType === "mixed"
    ? parseMovieQueueLines(body?.titles_text ?? (Array.isArray(body?.titles) ? body.titles.join("\n") : ""))
    : (Array.isArray(body?.titles) ? body.titles : String(body?.titles_text || "").split(/\r?\n/))
      .map((value) => ({ title: String(value || "").trim(), media_type: requestedType }))
      .filter((entry) => entry.title);

  if (!entries.length) throw new Error("Enter at least one movie or series title");
  if (entries.length > MAX_BATCH_SIZE) throw new Error("A maximum of 100 titles can be added at once");
  if (entries.some((entry) => entry.title.length > 200)) throw new Error("Each title must be 200 characters or fewer");

  const supabase = getSupabase(env);
  const inserted = [];
  const duplicates = [];
  for (const entry of entries) {
    const { title, media_type } = entry;
    const normalized = normalizeMovieQueueTitle(title);
    if (!normalized) throw new Error("Each title must contain at least one letter or number");
    const { data: existing, error: lookupError } = await supabase
      .from("movie_queue_items")
      .select("id,submitted_title,status,media_type")
      .eq("normalized_title", normalized)
      .eq("media_type", media_type)
      .in("status", ACTIVE_DUPLICATE_STATES)
      .limit(1);
    if (lookupError) throw lookupError;
    if (existing?.length) {
      duplicates.push({
        title,
        existing_title: existing[0].submitted_title,
        existing_id: existing[0].id,
        media_type,
        status: existing[0].status
      });
      continue;
    }
    const { data, error } = await supabase
      .from("movie_queue_items")
      .insert({
        submitted_title: title,
        normalized_title: normalized,
        media_type,
        created_by: actor.userId
      })
      .select("id,submitted_title,media_type,status,created_at")
      .single();
    if (error?.code === "23505") {
      const { data: raced, error: racedLookupError } = await supabase
        .from("movie_queue_items")
        .select("id,submitted_title,status,media_type")
        .eq("normalized_title", normalized)
        .eq("media_type", media_type)
        .in("status", ACTIVE_DUPLICATE_STATES)
        .limit(1);
      if (racedLookupError) throw racedLookupError;
      if (raced?.length) {
        duplicates.push({
          title,
          existing_title: raced[0].submitted_title,
          existing_id: raced[0].id,
          media_type,
          status: raced[0].status
        });
        continue;
      }
    }
    if (error) throw error;
    inserted.push(data);
  }
  return { inserted, duplicates, total_requested: entries.length };
}

