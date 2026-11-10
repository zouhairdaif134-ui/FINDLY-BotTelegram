import { getSupabase } from "./supabase.js";

const SAFE_CODE = /^[A-Z0-9_]{1,64}$/;
const SAFE_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

export function normalizeWorkerErrorEvent({ path, method, status, code, type }) {
  const responseStatus = Number(status);
  if (!Number.isInteger(responseStatus) || responseStatus < 500 || responseStatus > 599) return null;
  const safePath = String(path || "/").split("?")[0].slice(0, 180) || "/";
  const safeMethod = SAFE_METHODS.has(String(method || "").toUpperCase())
    ? String(method).toUpperCase()
    : "OTHER";
  const safeCode = SAFE_CODE.test(String(code || "")) ? String(code) : null;
  const safeType = /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(String(type || ""))
    ? String(type)
    : "Error";
  return {
    request_path: safePath,
    request_method: safeMethod,
    response_status: responseStatus,
    error_code: safeCode,
    error_type: safeType
  };
}

export async function recordWorkerError(env, event) {
  const row = normalizeWorkerErrorEvent(event);
  if (!row) return false;
  try {
    const { error } = await getSupabase(env).from("worker_error_events").insert(row);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("FINDLY worker error metric could not be stored:", {
      code: error?.code || null,
      status: error?.status || null
    });
    return false;
  }
}
