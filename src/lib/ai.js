import { getSupabase } from "./supabase.js";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_API_URL = "https://api.openai.com/v1/chat/completions";

function normalizeConfig(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value;
}

export async function getAIConfig(env, botId) {
  if (!botId) {
    return { enabled: false };
  }

  const supabase = getSupabase(env);

  const { data, error } = await supabase
    .from("bot_settings")
    .select("setting_value")
    .eq("bot_id", botId)
    .eq("setting_key", "ai")
    .maybeSingle();

  if (error) {
    throw error;
  }

  const config = normalizeConfig(data?.setting_value);

  return {
    enabled: config.enabled === true,
    model: config.model || env.AI_MODEL || DEFAULT_MODEL,
    apiUrl: config.api_url || env.AI_API_URL || DEFAULT_API_URL,
    systemPrompt:
      config.system_prompt ||
      "You are a helpful assistant for FINDLY. Answer clearly and briefly.",
    temperature:
      typeof config.temperature === "number"
        ? Math.min(2, Math.max(0, config.temperature))
        : 0.7,
    maxTokens:
      Number.isInteger(config.max_tokens) &&
      config.max_tokens > 0
        ? Math.min(2000, config.max_tokens)
        : 700
  };
}

export async function generateAIReply(
  env,
  bot,
  userText
) {
  const config = await getAIConfig(env, bot?.id);

  if (!config.enabled) {
    return null;
  }

  const apiKey = env.AI_API_KEY;

  if (!apiKey) {
    throw new Error("AI_API_KEY is missing");
  }

  const input = String(userText || "").trim().slice(0, 4000);

  if (!input) {
    return null;
  }

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "system",
          content: config.systemPrompt
        },
        {
          role: "user",
          content: input
        }
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `AI provider request failed: ${response.status} ${body.slice(0, 500)}`
    );
  }

  const payload = await response.json();
  const reply = payload?.choices?.[0]?.message?.content;

  if (typeof reply !== "string" || !reply.trim()) {
    throw new Error("AI provider returned an empty response");
  }

  return reply.trim().slice(0, 3900);
}
