import { getSupabase } from "./supabase.js";
import { searchTmdbCatalog, importTmdbCatalogItem } from "../routes/content.js";

const ACTIVE_DUPLICATE_STATES = ["pending", "processing", "needs_review", "ready_for_review", "already_in_catalog"];
const MAX_BATCH_SIZE = 100;

export function normalizeMovieQueueTitle(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
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
    .order("created_at", { ascending: false })
    .limit(300);
  if (status && ["pending", "processing", "needs_review", "ready_for_review", "already_in_catalog", "failed", "rejected", "published"].includes(status)) {
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function enqueueMovieQueue(env, body, actor) {
  const rawTitles = Array.isArray(body?.titles)
    ? body.titles
    : String(body?.titles_text || "").split(/\r?\n/);
  const mediaType = body?.media_type || "movie";
  if (!["movie", "series"].includes(mediaType)) throw new Error("media_type must be movie or series");
  const titles = [...new Set(rawTitles.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!titles.length) throw new Error("Enter at least one movie or series title");
  if (titles.length > MAX_BATCH_SIZE) throw new Error("A maximum of 100 titles can be added at once");
  if (titles.some((title) => title.length > 200)) throw new Error("Each title must be 200 characters or fewer");

  const supabase = getSupabase(env);
  const inserted = [];
  const duplicates = [];
  for (const title of titles) {
    const normalized = normalizeMovieQueueTitle(title);
    if (!normalized) continue;
    const { data: existing, error: lookupError } = await supabase
      .from("movie_queue_items")
      .select("id,submitted_title,status")
      .eq("normalized_title", normalized)
      .eq("media_type", mediaType)
      .in("status", ACTIVE_DUPLICATE_STATES)
      .limit(1);
    if (lookupError) throw lookupError;
    if (existing?.length) {
      duplicates.push({ title, existing_id: existing[0].id, status: existing[0].status });
      continue;
    }
    const { data, error } = await supabase
      .from("movie_queue_items")
      .insert({
        submitted_title: title,
        normalized_title: normalized,
        media_type: mediaType,
        created_by: actor.userId
      })
      .select("id,submitted_title,media_type,status,created_at")
      .single();
    if (error) throw error;
    inserted.push(data);
  }
  return { inserted, duplicates, total_requested: titles.length };
}

export async function retryMovieQueueItem(env, id) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from("movie_queue_items")
    .update({
      status: "pending",
      attempt_count: 0,
      next_attempt_at: new Date().toISOString(),
      lease_expires_at: null,
      last_error_code: null,
      last_error_message: null
    })
    .eq("id", id)
    .eq("status", "failed")
    .select("id,status")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Only failed queue items can be retried");
  return data;
}

async function getSystemActor(env) {
  const { data, error } = await getSupabase(env)
    .from("admin_profiles")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("No active administrator is available for the scheduled import audit");
  return { userId: data.id };
}

async function saveQueueState(supabase, id, patch) {
  const { error } = await supabase
    .from("movie_queue_items")
    .update({ ...patch, lease_expires_at: null })
    .eq("id", id);
  if (error) throw error;
}

async function findExistingCatalogTitle(supabase, tmdbId) {
  const { data, error } = await supabase
    .from("movie_external_ids")
    .select("title_id")
    .eq("provider", "tmdb")
    .eq("external_id", String(tmdbId))
    .maybeSingle();
  if (error) throw error;
  return data?.title_id || null;
}

async function saveAlreadyInCatalog(supabase, itemId, catalogTitleId, tmdbId, nowIso) {
  await saveQueueState(supabase, itemId, {
    status: "already_in_catalog",
    tmdb_id: Number(tmdbId),
    catalog_title_id: catalogTitleId,
    tmdb_candidates: [],
    processed_at: nowIso,
    last_error_code: null,
    last_error_message: null
  });
}

export async function resolveMovieQueueItem(env, id, body, actor) {
  const supabase = getSupabase(env);
  const { data: item, error } = await supabase
    .from("movie_queue_items")
    .select("id,status,media_type,tmdb_candidates")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!item || item.status !== "needs_review") throw new Error("Queue item is not waiting for match review");
  const tmdbId = String(body?.tmdb_id || "");
  const candidate = (item.tmdb_candidates || []).find((entry) => String(entry.tmdb_id) === tmdbId);
  if (!candidate) throw new Error("Selected TMDB result is not in this queue item's candidate list");
  const existingTitleId = await findExistingCatalogTitle(supabase, tmdbId);
  if (existingTitleId) {
    await saveAlreadyInCatalog(supabase, id, existingTitleId, tmdbId, new Date().toISOString());
    return { queue_item_id: id, catalog_title_id: existingTitleId, status: "already_in_catalog" };
  }
  const imported = await importTmdbCatalogItem(env, tmdbId, item.media_type, actor);
  await saveQueueState(supabase, id, {
    status: "ready_for_review",
    tmdb_id: Number(tmdbId),
    catalog_title_id: imported.id,
    tmdb_candidates: [],
    processed_at: new Date().toISOString(),
    last_error_code: null,
    last_error_message: null
  });
  return { queue_item_id: id, catalog_title_id: imported.id, status: "ready_for_review" };
}

export async function rejectMovieQueueItem(env, id) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from("movie_queue_items")
    .update({ status: "rejected", lease_expires_at: null })
    .eq("id", id)
    .in("status", ["needs_review", "ready_for_review", "failed"])
    .select("id,status")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This queue item cannot be rejected in its current state");
  return data;
}

export async function processMovieQueueHourly(env, now = new Date()) {
  const supabase = getSupabase(env);
  const nowIso = now.toISOString();
  const slotStart = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()
  )).toISOString();

  // Recover only expired leases; the unique slot record still prevents a second
  // item from being processed in an already-consumed hour.
  const { error: leaseError } = await supabase
    .from("movie_queue_items")
    .update({ status: "pending", lease_expires_at: null, next_attempt_at: nowIso })
    .eq("status", "processing")
    .lt("lease_expires_at", nowIso);
  if (leaseError) throw leaseError;

  const { data: claimed, error: claimError } = await supabase.rpc("claim_next_movie_queue_item", {
    p_slot_start: slotStart,
    p_lease_expires_at: new Date(now.getTime() + 10 * 60 * 1000).toISOString()
  });
  if (claimError) throw claimError;
  const item = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!item) return { processed: false, slot_start: slotStart };

  try {
    const results = await searchTmdbCatalog(env, item.submitted_title, item.media_type, 1);
    if (!results.length) {
      await saveQueueState(supabase, item.id, {
        status: "failed",
        last_error_code: "TMDB_NO_MATCH",
        last_error_message: "TMDB returned no matching titles",
        processed_at: nowIso
      });
      return { processed: true, item_id: item.id, status: "failed" };
    }
    const selected = selectTmdbQueueMatch(results, item.submitted_title);

    if (!selected) {
      await saveQueueState(supabase, item.id, {
        status: "needs_review",
        tmdb_candidates: results.slice(0, 10),
        last_error_code: null,
        last_error_message: null
      });
      return { processed: true, item_id: item.id, status: "needs_review" };
    }

    const existingTitleId = await findExistingCatalogTitle(supabase, selected.tmdb_id);
    if (existingTitleId) {
      await saveAlreadyInCatalog(supabase, item.id, existingTitleId, selected.tmdb_id, nowIso);
      return { processed: true, item_id: item.id, status: "already_in_catalog" };
    }

    const actor = await getSystemActor(env);
    const imported = await importTmdbCatalogItem(env, selected.tmdb_id, item.media_type, actor);
    await saveQueueState(supabase, item.id, {
      status: "ready_for_review",
      tmdb_id: selected.tmdb_id,
      catalog_title_id: imported.id,
      tmdb_candidates: [],
      processed_at: nowIso,
      last_error_code: null,
      last_error_message: null
    });
    return { processed: true, item_id: item.id, status: "ready_for_review" };
  } catch (error) {
    const details = safeError(error);
    const retryable = ["TMDB_UPSTREAM_ERROR", "TypeError", "AbortError"].includes(details.code) ||
      /timeout|network|rate limit|temporar/i.test(details.message);
    const shouldRetry = retryable && Number(item.attempt_count || 0) < 3;
    await saveQueueState(supabase, item.id, {
      status: shouldRetry ? "pending" : "failed",
      next_attempt_at: shouldRetry
        ? new Date(now.getTime() + Math.min(60, 5 * (2 ** Number(item.attempt_count || 0))) * 60 * 1000).toISOString()
        : nowIso,
      last_error_code: details.code,
      last_error_message: details.message,
      processed_at: shouldRetry ? null : nowIso
    });
    console.error("FINDLY movie queue item failed:", { item_id: item.id, code: details.code });
    return { processed: true, item_id: item.id, status: shouldRetry ? "pending" : "failed", error_code: details.code };
  }
}

export async function markMovieQueuePublished(env, catalogTitleId) {
  if (!catalogTitleId) return;
  const { error } = await getSupabase(env)
    .from("movie_queue_items")
    .update({ status: "published" })
    .eq("catalog_title_id", catalogTitleId)
    .in("status", ["ready_for_review", "already_in_catalog"]);
  if (error) throw error;
}
