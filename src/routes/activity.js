import { getActivityLogs } from "../lib/admin-audit.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENTITY_TYPES = new Set(["movie", "bot", "category", "content", "telegram_user", "setting", "admin"]);

function optionalDate(value, name) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(name + " must be a valid ISO date");
  }
  return parsed.toISOString();
}

export function parseActivityFilters(url) {
  const params = url.searchParams;
  const rawLimit = params.get("limit");
  const rawOffset = params.get("offset");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  const offset = rawOffset === null ? 0 : Number(rawOffset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("limit must be an integer between 1 and 100");
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("offset must be a non-negative integer");
  }

  const actorId = params.get("actor_id") || null;
  if (actorId && !UUID_PATTERN.test(actorId)) {
    throw new Error("actor_id must be a valid UUID");
  }

  const action = params.get("action") || null;
  if (action && !/^[a-z][a-z0-9_.-]{1,79}$/.test(action)) {
    throw new Error("action filter is invalid");
  }

  const entityType = params.get("entity_type") || null;
  if (entityType && !ENTITY_TYPES.has(entityType)) {
    throw new Error("entity_type filter is invalid");
  }

  const result = params.get("result") || null;
  if (result && !["success", "failure"].includes(result)) {
    throw new Error("result must be success or failure");
  }

  const from = optionalDate(params.get("from"), "from");
  const to = optionalDate(params.get("to"), "to");
  if (from && to && new Date(from) > new Date(to)) {
    throw new Error("from must be earlier than or equal to to");
  }

  return { limit, offset, actorId, action, entityType, result, from, to };
}

export async function getActivity(env, url) {
  return getActivityLogs(env, parseActivityFilters(url));
}
