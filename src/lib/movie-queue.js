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
    .order("created_at", { ascending: true }).order("queue_order", { ascending: true })
    .limit(300);
  if (status && ["pending", "processing", "resolving", "needs_review", "ready_for_review", "already_in_catalog", "failed", "rejected", "published"].includes(status)) {
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function findActiveQueueItems(supabase, entries) {
  const normalizedTitles = [...new Set(entries.map((entry) => entry.normalized_title))];
  const mediaTypes = [...new Set(entries.map((entry) => entry.media_type))];
  const { data, error } = await supabase
    .from("movie_queue_items")
    .select("id,submitted_title,normalized_title,status,media_type")
    .in("normalized_title", normalizedTitles)
    .in("media_type", mediaTypes)
    .in("status", ACTIVE_DUPLICATE_STATES);
  if (error) throw error;
  return data || [];
}

function queueDuplicate(entry, existing, status = existing.status) {
  return {
    title: entry.title,
    existing_title: existing.submitted_title,
    existing_id: existing.id || null,
    media_type: entry.media_type,
    status
  };
}

export async function enqueueMovieQueueBatch(supabase, entries, actor) {
  if (!Array.isArray(entries) || !entries.length) {
    throw new Error("Enter at least one movie or series title");
  }
  if (entries.length > MAX_BATCH_SIZE) {
    throw new Error("A maximum of 100 titles can be added at once");
  }

  const firstEntries = [];
  const duplicates = [];
  const firstByKey = new Map();

  for (const [inputOrder, entry] of entries.entries()) {
    const title = String(entry?.title || "").trim();
    const media_type = entry?.media_type;
    if (!title || title.length > 200) {
      throw new Error("Each title must contain between 1 and 200 characters");
    }
    if (!["movie", "series"].includes(media_type)) {
      throw new Error("Each queue entry must have media_type movie or series");
    }
    const normalized_title = normalizeMovieQueueTitle(title);
    if (!normalized_title) {
      throw new Error("Each title must contain at least one letter or number");
    }

    const normalizedEntry = { title, media_type, normalized_title, input_order: inputOrder };
    const key = `${media_type}:${normalized_title}`;
    const first = firstByKey.get(key);
    if (first) {
      duplicates.push({ ...queueDuplicate(normalizedEntry, {
        submitted_title: first.title,
        id: null
      }, "duplicate_in_batch"), _input_order: inputOrder });
      continue;
    }
    firstByKey.set(key, normalizedEntry);
    firstEntries.push(normalizedEntry);
  }

  const existingRows = await findActiveQueueItems(supabase, firstEntries);
  const existingByKey = new Map(existingRows.map((row) => [
    `${row.media_type}:${row.normalized_title}`,
    row
  ]));

  const rowsToInsert = [];
  for (const entry of firstEntries) {
    const existing = existingByKey.get(`${entry.media_type}:${entry.normalized_title}`);
    if (existing) {
      duplicates.push({ ...queueDuplicate(entry, existing), _input_order: entry.input_order });
    } else {
      rowsToInsert.push({
        submitted_title: entry.title,
        normalized_title: entry.normalized_title,
        media_type: entry.media_type,
        created_by: actor.userId
      });
    }
  }

  if (!rowsToInsert.length) {
    return {
      inserted: [],
      duplicates: duplicates.sort((a, b) => a._input_order - b._input_order).map(({ _input_order, ...item }) => item),
      total_requested: entries.length
    };
  }

  const insertRows = async (rows) => {
    const { data, error } = await supabase
      .from("movie_queue_items")
      .insert(rows)
      .select("id,submitted_title,media_type,status,created_at");
    return { data: data || [], error };
  };

  let { data: inserted, error } = await insertRows(rowsToInsert);
  if (error?.code === "23505") {
    // A concurrent admin may have inserted one of these titles after our lookup.
    // Re-read the conflicting keys, report them, and retry the remaining rows once.
    const racedRows = await findActiveQueueItems(supabase, firstEntries);
    const racedByKey = new Map(racedRows.map((row) => [
      `${row.media_type}:${row.normalized_title}`,
      row
    ]));
    const retryRows = [];
    for (const row of rowsToInsert) {
      const existing = racedByKey.get(`${row.media_type}:${row.normalized_title}`);
      if (existing) {
        const original = firstByKey.get(`${row.media_type}:${row.normalized_title}`);
        duplicates.push({ ...queueDuplicate({
          title: row.submitted_title,
          media_type: row.media_type
        }, existing), _input_order: original?.input_order ?? Number.MAX_SAFE_INTEGER });
      } else {
        retryRows.push(row);
      }
    }
    if (retryRows.length) {
      const retry = await insertRows(retryRows);
      if (retry.error) throw retry.error;
      inserted = retry.data;
    } else {
      inserted = [];
    }
    error = null;
  }
  if (error) throw error;

  return {
    inserted,
    duplicates: duplicates.sort((a, b) => a._input_order - b._input_order).map(({ _input_order, ...item }) => item),
    total_requested: entries.length
  };
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

  return enqueueMovieQueueBatch(getSupabase(env), entries, actor);
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
      lease_token: null,
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

async function getQueueSubmitterActor(env, submitterId) {
  if (!submitterId) throw new Error("Queue item has no submitting administrator for audit attribution");
  const { data, error } = await getSupabase(env)
    .from("admin_profiles")
    .select("id")
    .eq("id", submitterId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("The administrator who submitted this queue item is no longer active");
  return { userId: data.id };
}

async function saveQueueState(supabase, id, leaseToken, expectedStatus, patch) {
  const { data, error } = await supabase
    .from("movie_queue_items")
    .update({ ...patch, lease_expires_at: null, lease_token: null })
    .eq("id", id)
    .eq("status", expectedStatus)
    .eq("lease_token", leaseToken)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Movie queue lease was lost; stale processing cannot update this item");
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

async function saveAlreadyInCatalog(supabase, itemId, leaseToken, expectedStatus, catalogTitleId, tmdbId, nowIso) {
  await saveQueueState(supabase, itemId, leaseToken, expectedStatus, {
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
  assertTmdbAccessAllowed(env);
  const supabase = getSupabase(env);
  const leaseExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { data: claimed, error: claimError } = await supabase.rpc("claim_movie_queue_resolution", {
    p_queue_item_id: id,
    p_lease_expires_at: leaseExpiresAt
  });
  if (claimError) throw claimError;
  const item = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!item) throw new Error("Queue item is no longer waiting for match review");

  try {
    const tmdbId = String(body?.tmdb_id || "");
    const candidate = (item.tmdb_candidates || []).find((entry) => String(entry.tmdb_id) === tmdbId);
    if (!candidate) throw new Error("Selected TMDB result is not in this queue item's candidate list");

    const existingTitleId = await findExistingCatalogTitle(supabase, tmdbId);
    if (existingTitleId) {
      await saveAlreadyInCatalog(supabase, id, item.lease_token, "resolving", existingTitleId, tmdbId, new Date().toISOString());
      return { queue_item_id: id, catalog_title_id: existingTitleId, status: "already_in_catalog" };
    }

    const imported = await importTmdbCatalogItem(env, tmdbId, item.media_type, actor);
    await saveQueueState(supabase, id, item.lease_token, "resolving", {
      status: "ready_for_review",
      tmdb_id: Number(tmdbId),
      catalog_title_id: imported.id,
      tmdb_candidates: [],
      processed_at: new Date().toISOString(),
      last_error_code: null,
      last_error_message: null
    });
    return { queue_item_id: id, catalog_title_id: imported.id, status: "ready_for_review" };
  } catch (error) {
    const { error: releaseError } = await supabase
      .from("movie_queue_items")
      .update({ status: "needs_review", lease_expires_at: null, lease_token: null })
      .eq("id", id)
      .eq("status", "resolving")
      .eq("lease_token", item.lease_token);
    if (releaseError) {
      console.error("FINDLY movie queue match claim could not be released:", {
        item_id: id,
        code: releaseError.code || null
      });
    }
    throw error;
  }
}

export async function rejectMovieQueueItem(env, id) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from("movie_queue_items")
    .update({ status: "rejected", lease_expires_at: null, lease_token: null })
    .eq("id", id)
    .in("status", ["needs_review", "ready_for_review", "failed"])
    .select("id,status")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This queue item cannot be rejected in its current state");
  return data;
}

export async function processMovieQueueHourly(env, now = new Date()) {
  if (!isMovieQueueProcessingEnabled(env)) {
    return { processed: false, skipped: true, reason: "TMDB_ACCESS_DISABLED" };
  }
  const supabase = getSupabase(env);
  const nowIso = now.toISOString();
  const slotStart = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()
  )).toISOString();

  // Recover only expired leases; the unique slot record still prevents a second
  // item from being processed in an already-consumed hour.
  const { error: leaseError } = await supabase
    .from("movie_queue_items")
    .update({ status: "pending", lease_expires_at: null, lease_token: null, next_attempt_at: nowIso })
    .eq("status", "processing")
    .lt("lease_expires_at", nowIso);
  if (leaseError) throw leaseError;

  const { error: resolutionLeaseError } = await supabase
    .from("movie_queue_items")
    .update({ status: "needs_review", lease_expires_at: null, lease_token: null })
    .eq("status", "resolving")
    .lt("lease_expires_at", nowIso);
  if (resolutionLeaseError) throw resolutionLeaseError;

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
      await saveQueueState(supabase, item.id, item.lease_token, "processing", {
        status: "failed",
        last_error_code: "TMDB_NO_MATCH",
        last_error_message: "TMDB returned no matching titles",
        processed_at: nowIso
      });
      return { processed: true, item_id: item.id, status: "failed" };
    }
    const selected = selectTmdbQueueMatch(results, item.submitted_title);

    if (!selected) {
      await saveQueueState(supabase, item.id, item.lease_token, "processing", {
        status: "needs_review",
        tmdb_candidates: results.slice(0, 10),
        last_error_code: null,
        last_error_message: null
      });
      return { processed: true, item_id: item.id, status: "needs_review" };
    }

    const existingTitleId = await findExistingCatalogTitle(supabase, selected.tmdb_id);
    if (existingTitleId) {
      await saveAlreadyInCatalog(supabase, item.id, item.lease_token, "processing", existingTitleId, selected.tmdb_id, nowIso);
      return { processed: true, item_id: item.id, status: "already_in_catalog" };
    }

    const actor = await getQueueSubmitterActor(env, item.created_by);
    const imported = await importTmdbCatalogItem(env, selected.tmdb_id, item.media_type, actor);
    await saveQueueState(supabase, item.id, item.lease_token, "processing", {
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
    await saveQueueState(supabase, item.id, item.lease_token, "processing", {
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
