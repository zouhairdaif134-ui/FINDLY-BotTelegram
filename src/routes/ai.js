import { getSettings, createSetting, updateSetting } from "./settings.js";
import { normalizeAIConfig } from "../lib/ai.js";

const ALLOWED_CONFIG_KEYS = new Set([
  "enabled", "model", "api_url", "system_prompt", "temperature",
  "max_tokens", "timeout_ms"
]);
const SECRET_KEY_PATTERN = /(api.?key|secret|password|access.?token|refresh.?token)/i;

function requireBotId(botId) {
  if (typeof botId !== "string" || !botId.trim()) {
    throw new Error("bot_id is required");
  }
  return botId.trim();
}

function isProviderConfigured(env) {
  return typeof env?.AI?.run === "function" || Boolean(env?.AI_API_KEY);
}

function publicConfig(config) {
  return {
    enabled: config.enabled,
    model: config.model,
    api_url: config.apiUrl,
    system_prompt: config.systemPrompt,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    timeout_ms: config.timeoutMs
  };
}

export async function getAIAdminConfig(env, botId) {
  const id = requireBotId(botId);
  const settings = await getSettings(env, id);
  const setting = settings.find((item) => item.setting_key === "ai");
  const config = normalizeAIConfig(setting?.setting_value, env);
  return {
    bot_id: id,
    config: publicConfig(config),
    provider_configured: isProviderConfigured(env)
  };
}

export function normalizeAIAdminInput(input, env = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("config must be an object");
  }

  for (const key of Object.keys(input)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error("Provider credentials cannot be saved through the dashboard");
    }
    if (!ALLOWED_CONFIG_KEYS.has(key)) {
      throw new Error(`Unsupported AI configuration field: ${key}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "enabled") && typeof input.enabled !== "boolean") {
    throw new Error("enabled must be a boolean");
  }
  if (Object.prototype.hasOwnProperty.call(input, "temperature") &&
      (typeof input.temperature !== "number" || !Number.isFinite(input.temperature))) {
    throw new Error("temperature must be a finite number");
  }
  for (const key of ["model", "api_url", "system_prompt"]) {
    if (Object.prototype.hasOwnProperty.call(input, key) && typeof input[key] !== "string") {
      throw new Error(`${key} must be a string`);
    }
  }
  for (const key of ["max_tokens", "timeout_ms"]) {
    if (Object.prototype.hasOwnProperty.call(input, key) &&
        (!Number.isInteger(input[key]) || input[key] <= 0)) {
      throw new Error(`${key} must be a positive integer`);
    }
  }

  const normalized = normalizeAIConfig(input, env);
  if (input.api_url && normalized.apiUrl !== input.api_url.trim()) {
    throw new Error("Provider URL is not allowed; configure its hostname in AI_ALLOWED_HOSTS first");
  }
  return {
    normalized,
    stored: {
      enabled: normalized.enabled,
      model: normalized.model,
      api_url: normalized.apiUrl,
      system_prompt: normalized.systemPrompt,
      temperature: normalized.temperature,
      max_tokens: normalized.maxTokens,
      timeout_ms: normalized.timeoutMs
    }
  };
}

export async function saveAIAdminConfig(env, payload, actor) {
  const botId = requireBotId(payload?.bot_id);
  const { normalized, stored } = normalizeAIAdminInput(payload?.config, env);
  const settings = await getSettings(env, botId);
  const existing = settings.find((item) => item.setting_key === "ai");
  if (existing?.id) {
    await updateSetting(env, existing.id, { setting_value: stored }, actor);
  } else {
    await createSetting(env, { bot_id: botId, setting_key: "ai", setting_value: stored }, actor);
  }
  return {
    bot_id: botId,
    config: publicConfig(normalized),
    provider_configured: Boolean(env.AI_API_KEY)
  };
}
