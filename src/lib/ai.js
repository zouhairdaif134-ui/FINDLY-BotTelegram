import { getSupabase } from "./supabase.js";
import { buildAIMemoryMessages } from "./ai-memory.js";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful assistant for FINDLY. Answer clearly and briefly.";

function boundedString(value, fallback, maxLength) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().slice(0, maxLength);
  return normalized || fallback;
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) {
    return false;
  }
  const octets = parts.map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127);
}

function safeProviderUrl(value, fallback, allowedHosts = ["api.openai.com"]) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const allowed = new Set(allowedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean));
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      !hostname ||
      !allowed.has(hostname) ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".test") ||
      hostname.includes(":") ||
      isPrivateIpv4(hostname)
    ) {
      return fallback;
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

/**
 * Normalize untrusted bot_settings/environment values into a bounded runtime
 * configuration. This function is pure and never reads or returns credentials.
 */
export function normalizeAIConfig(value, env = {}) {
  const config = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  const modelFallback = boundedString(env.AI_MODEL, DEFAULT_MODEL, 100);
  const allowedHosts = typeof env.AI_ALLOWED_HOSTS === "string"
    ? env.AI_ALLOWED_HOSTS.split(",").map((host) => host.trim().toLowerCase())
    : ["api.openai.com"];
  if (!allowedHosts.includes("api.openai.com")) allowedHosts.push("api.openai.com");
  const urlFallback = safeProviderUrl(
    boundedString(env.AI_API_URL, DEFAULT_API_URL, 500),
    DEFAULT_API_URL,
    allowedHosts
  );
  const temperature = typeof config.temperature === "number" &&
    Number.isFinite(config.temperature)
    ? Math.min(2, Math.max(0, config.temperature))
    : 0.7;
  const maxTokens = Number.isInteger(config.max_tokens) && config.max_tokens > 0
    ? Math.min(2000, config.max_tokens)
    : 700;
  const timeoutMs = Number.isInteger(config.timeout_ms) && config.timeout_ms > 0
    ? Math.min(30000, Math.max(1000, config.timeout_ms))
    : 15000;

  return {
    enabled: config.enabled === true,
    model: boundedString(config.model, modelFallback, 100),
    apiUrl: safeProviderUrl(
      boundedString(config.api_url, urlFallback, 500),
      DEFAULT_API_URL,
      allowedHosts
    ),
    systemPrompt: boundedString(
      config.system_prompt,
      DEFAULT_SYSTEM_PROMPT,
      2000
    ),
    temperature,
    maxTokens,
    timeoutMs
  };
}

export async function getAIConfig(env, botId) {
  if (!botId) {
    return normalizeAIConfig({}, env);
  }

  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from("bot_settings")
    .select("setting_value")
    .eq("bot_id", botId)
    .eq("setting_key", "ai")
    .maybeSingle();

  if (error) throw error;
  return normalizeAIConfig(data?.setting_value, env);
}

export async function generateAIReply(env, bot, userText, memory = {}) {
  const config = memory.config || await getAIConfig(env, bot?.id);
  if (!config.enabled) return null;

  const apiKey = env.AI_API_KEY;
  if (!apiKey) {
    throw new Error("AI provider is not configured");
  }

  const input = String(userText || "").trim().slice(0, 4000);
  if (!input) return null;

  let response;
  try {
    response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        messages: buildAIMemoryMessages(
          config.systemPrompt,
          memory.history,
          input,
          memory.preferences
        ),
        temperature: config.temperature,
        max_tokens: config.maxTokens
      }),
      signal: AbortSignal.timeout(config.timeoutMs)
    });
  } catch {
    throw new Error("AI provider request could not be completed");
  }

  if (!response.ok) {
    throw new Error(`AI provider request failed with status ${response.status}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("AI provider returned an invalid response");
  }

  const reply = payload?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) {
    throw new Error("AI provider returned an empty response");
  }

  return reply.trim().slice(0, 3900);
}
