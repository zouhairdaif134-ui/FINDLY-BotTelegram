import { getSupabase } from "../lib/supabase.js";
import { getTmdbRequestDetails } from "./content.js";
import { recordAdminEvent } from "../lib/admin-audit.js";

const REQUEST_STATUSES = new Set(["pending", "reviewing", "approved", "added", "rejected"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeMovieRequestStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return REQUEST_STATUSES.has(status) ? status : null;
}

export async function submitMovieRequest(env, telegramUserId, body = {}) {
  const tmdbId = String(body.tmdb_id || "");
  const mediaType = body.media_type === "series" ? "series" : body.media_type === "movie" ? "movie" : "";
  if (!/^\d{1,12}$/.test(tmdbId) || !mediaType) {
    const error = new Error("Invalid movie request");
    error.status = 400;
    error.code = "INVALID_MOVIE_REQUEST";
    throw error;
  }

  // Fetch metadata server-side. Never trust client-supplied title or synopsis fields.
  const metadata = await getTmdbRequestDetails(env, tmdbId, mediaType);
  if (!metadata.title) {
    const error = new Error("TMDB title was not found");
    error.status = 404;
    error.code = "TMDB_TITLE_NOT_FOUND";
    throw error;
  }

  const { data, error } = await getSupabase(env).rpc("submit_movie_request", {
    p_tmdb_id: metadata.tmdb_id,
    p_media_type: metadata.media_type,
    p_title: metadata.title,
    p_original_title: metadata.original_title,
    p_release_year: metadata.release_year,
    p_rating: metadata.rating,
    p_overview: metadata.overview,
    p_poster_path: metadata.poster_path,
    p_backdrop_path: metadata.backdrop_path,
    p_telegram_user_id: telegramUserId
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.request_id) throw new Error("Movie request could not be saved");
  return {
    request_id: result.request_id,
    request_count: Number(result.request_count || 0),
    status: result.request_status,
    is_new_requester: result.is_new_user === true,
    tmdb_url: metadata.tmdb_url
  };
}

export async function getMovieRequests(env, requestedStatus = "all") {
  const status = requestedStatus === "all" ? "all" : normalizeMovieRequestStatus(requestedStatus);
  if (!status) {
    const error = new Error("Invalid movie request status");
    error.status = 400;
    error.code = "INVALID_MOVIE_REQUEST_STATUS";
    throw error;
  }
  const db = getSupabase(env);
  let query = db.from("movie_requests")
    .select("id,tmdb_id,media_type,title,original_title,release_year,rating,overview,poster_path,tmdb_url,request_count,status,created_at,updated_at,last_requested_at")
    .order("request_count", { ascending: false })
    .order("last_requested_at", { ascending: false })
    .limit(500);
  if (status !== "all") query = query.eq("status", status);
  const [itemsResult, pendingResult] = await Promise.all([
    query,
    db.from("movie_requests").select("id", { count: "exact", head: true }).eq("status", "pending")
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (pendingResult.error) throw pendingResult.error;
  return { items: itemsResult.data || [], pending_count: Number(pendingResult.count || 0) };
}

export async function updateMovieRequestStatus(env, id, requestedStatus, actor) {
  if (!UUID_RE.test(String(id || ""))) {
    const error = new Error("Invalid movie request id");
    error.status = 400;
    error.code = "INVALID_MOVIE_REQUEST_ID";
    throw error;
  }
  const status = normalizeMovieRequestStatus(requestedStatus);
  if (!status) {
    const error = new Error("Invalid movie request status");
    error.status = 400;
    error.code = "INVALID_MOVIE_REQUEST_STATUS";
    throw error;
  }
  const db = getSupabase(env);
  const { data, error } = await db.from("movie_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,tmdb_id,media_type,title,status,request_count,updated_at")
    .single();
  if (error) throw error;
  try {
    await recordAdminEvent(env, actor, {
      action: "movie_request.status_update",
      entityType: "movie_request",
      entityId: id,
      details: { status, tmdb_id: data.tmdb_id, media_type: data.media_type }
    });
  } catch (auditError) {
    console.error("FINDLY movie request audit event failed:", { code: auditError?.code || null });
  }
  return data;
}
