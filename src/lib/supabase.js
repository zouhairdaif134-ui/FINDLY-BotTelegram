import { createClient } from "@supabase/supabase-js";

const REQUEST_TIMEOUT_MS = 10000;

function describeTarget(input) {
  try {
    const raw =
      typeof input === "string"
        ? input
        : input?.url || String(input);
    return new URL(raw).pathname;
  } catch {
    return "unknown";
  }
}

function tracedFetch(input, init = {}) {
  const signal =
    init.signal ||
    AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  return fetch(input, { ...init, signal }).catch(
    (error) => {
      throw new Error(
        `Supabase request failed (${describeTarget(input)}): ${
          error?.name || "Error"
        } ${error?.message || ""}`.trim()
      );
    }
  );
}

export function getSupabase(env) {
  if (!env.SUPABASE_URL) {
    throw new Error("SUPABASE_URL is missing");
  }

  if (!env.SUPABASE_SECRET_KEY) {
    throw new Error("SUPABASE_SECRET_KEY is missing");
  }

  return createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      global: {
        fetch: tracedFetch
      }
    }
  );
}
