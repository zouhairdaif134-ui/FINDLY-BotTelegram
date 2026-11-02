import { createClient } from "@supabase/supabase-js";

const isPagesPreview =
  typeof window !== "undefined" &&
  (window.location.hostname ===
    "feat-findly-movies-runtime-h.findly-bottelegram.pages.dev" ||
    /^[a-f0-9]{8}\.findly-bottelegram\.pages\.dev$/.test(
      window.location.hostname
    ));

const PRODUCTION_SUPABASE_URL =
  "https://rcebarvpmpxsosclexyg.supabase.co";
const PRODUCTION_PUBLISHABLE_KEY =
  "sb_publishable_RKDieHYjjBXkT3iV7YlW5w_fND0QxaG";

// Preview must fail closed until a dedicated Preview Supabase project is configured.
const SUPABASE_URL = isPagesPreview
  ? import.meta.env.VITE_SUPABASE_URL || "https://preview.invalid"
  : PRODUCTION_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = isPagesPreview
  ? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_preview_not_configured"
  : PRODUCTION_PUBLISHABLE_KEY;

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
