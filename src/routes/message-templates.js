import { getSupabase } from "../lib/supabase.js";
import { recordAdminMutation } from "../lib/admin-audit.js";

export const MESSAGE_TEMPLATE_DEFINITIONS = Object.freeze({
  findly: {
    label: "Master Bot",
    templates: {
      start: {
        label: "رسالة البداية",
        defaultValue: "<b>{bot_name}</b>\n\n{welcome_text}",
        placeholders: ["bot_name", "welcome_text"]
      },
      help: {
        label: "رسالة المساعدة",
        defaultValue: "<b>ℹ️ المساعدة</b>\n\nاستعمل /start باش ترجع للقائمة الرئيسية، واختار الخدمة اللي بغيتي من الأزرار.",
        placeholders: ["bot_name"]
      }
    }
  },
  movies: {
    label: "Watch Bot",
    templates: {
      start: {
        label: "رسالة البداية",
        defaultValue: "<b>{bot_name}</b>\n\n{welcome_text}",
        placeholders: ["bot_name", "welcome_text"]
      },
      help: {
        label: "رسالة المساعدة",
        defaultValue: "<b>ℹ️ المساعدة</b>\n\nاستعمل /start للعودة إلى القائمة الرئيسية.",
        placeholders: ["bot_name"]
      }
    }
  }
});

const ALLOWED_TAGS = new Set(["b","strong","i","em","u","ins","s","strike","del","code","pre","a"]);
const PLACEHOLDER_RE = /\{([a-z_]+)\}/g;

export const MESSAGE_BUTTON_ACTIONS = Object.freeze({
  findly: [
    { id: "home", label: "القائمة الرئيسية" },
    { id: "movies", label: "الأفلام والمسلسلات" },
    { id: "search", label: "البحث" },
    { id: "help", label: "المساعدة" }
  ],
  movies: [
    { id: "library", label: "المكتبة" },
    { id: "categories", label: "التصنيفات" },
    { id: "added", label: "المضاف حديثاً" },
    { id: "top", label: "الأعلى تقييماً" },
    { id: "search", label: "البحث" },
    { id: "favorites", label: "مكتبتي" },
    { id: "help", label: "المساعدة" }
  ]
});

export function validateMessageTemplate(botSlug, templateKey, value) {
  const definition = MESSAGE_TEMPLATE_DEFINITIONS[botSlug]?.templates?.[templateKey];
  if (!definition) throw new Error("Unsupported bot or message template.");
  if (typeof value !== "string" || !value.trim() || value.length > 1800) {
    throw new Error("Message template must contain 1 to 1800 characters.");
  }
  const placeholders = [...value.matchAll(PLACEHOLDER_RE)].map((match) => match[1]);
  for (const name of placeholders) {
    if (!definition.placeholders.includes(name)) {
      throw new Error(`Unsupported placeholder: {${name}}`);
    }
  }
  if (/[{}]/.test(value.replace(PLACEHOLDER_RE, ""))) {
    throw new Error("Template contains malformed placeholder braces.");
  }
  const tags = value.match(/<\/?[a-zA-Z][^>]*>/g) || [];
  const tagStack = [];
  for (const tag of tags) {
    const match = tag.match(/^<(\/)?([a-zA-Z]+)/);
    const tagName = match?.[2]?.toLowerCase();
    const isClosing = Boolean(match?.[1]);
    if (!tagName || !ALLOWED_TAGS.has(tagName)) {
      throw new Error("Only supported Telegram HTML formatting tags are allowed.");
    }
    if (tagName === "a" && !/^<a\s+href="https:\/\/[^"]+"\s*>$|^<\/a>$/.test(tag)) {
      throw new Error("Links must use a valid HTTPS href.");
    }
    if (tagName !== "a" && !/^<\/?(?:b|strong|i|em|u|ins|s|strike|del|code|pre)>$/.test(tag)) {
      throw new Error("Formatting tag attributes are not supported.");
    }
    if (isClosing) {
      if (tagStack.pop() !== tagName) throw new Error("Telegram HTML tags must be properly nested and closed.");
    } else {
      tagStack.push(tagName);
    }
  }
  if (tagStack.length) throw new Error("Telegram HTML tags must be properly nested and closed.");
  return value;
}

export function renderMessageTemplate(value, variables = {}) {
  return String(value).replace(PLACEHOLDER_RE, (_, name) => {
    const raw = String(variables[name] ?? "");
    return raw.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  });
}

export async function getMessageTemplates(env) {
  const supabase = getSupabase(env);
  const { data: bots, error: botsError } = await supabase
    .from("bots").select("id,slug,name").in("slug", ["findly","movies"]);
  if (botsError) throw botsError;
  const botIds = new Map((bots || []).map((bot) => [bot.slug, bot]));
  const ids = [...botIds.values()].map((bot) => bot.id);
  const { data: rows, error } = ids.length
    ? await supabase.from("bot_settings").select("id,bot_id,setting_value").eq("setting_key","message_templates").in("bot_id",ids)
    : { data: [], error: null };
  if (error) throw error;
  return Object.entries(MESSAGE_TEMPLATE_DEFINITIONS).map(([slug, definition]) => {
    const bot = botIds.get(slug);
    const row = (rows || []).find((item) => item.bot_id === bot?.id);
    const saved = row?.setting_value || {};
    return {
      bot_slug: slug,
      bot_name: bot?.name || definition.label,
      setting_id: row?.id || null,
      templates: Object.fromEntries(Object.entries(definition.templates).map(([key, item]) => [
        key, {
          label: item.label,
          value: typeof saved[key] === "string" ? saved[key] : item.defaultValue,
          default_value: item.defaultValue,
          placeholders: item.placeholders
        }
      ]))
    };
  });
}

export async function saveMessageTemplate(env, payload, actor) {
  const botSlug = String(payload?.bot_slug || "");
  const templateKey = String(payload?.template_key || "");
  const value = validateMessageTemplate(botSlug, templateKey, payload?.value);
  const definition = MESSAGE_TEMPLATE_DEFINITIONS[botSlug];
  const { data: bot, error: botError } = await getSupabase(env)
    .from("bots").select("id").eq("slug",botSlug).maybeSingle();
  if (botError) throw botError;
  if (!bot) throw new Error("Bot configuration was not found.");
  const { data: existing, error } = await getSupabase(env)
    .from("bot_settings").select("id,setting_value").eq("bot_id",bot.id).eq("setting_key","message_templates").maybeSingle();
  if (error) throw error;
  const next = { ...(existing?.setting_value || {}) , [templateKey]: value };
  await recordAdminMutation(env, actor, {
    action: "settings.message_template.update",
    entityType: "bot_setting",
    entityId: existing?.id || null,
    operation: existing ? "update" : "create",
    payload: existing
      ? { setting_value: next }
      : { bot_id: bot.id, setting_key: "message_templates", setting_value: next }
  });
  return { bot_slug: botSlug, template_key: templateKey, value, placeholders: definition.templates[templateKey].placeholders };
}

export async function getMessageTemplate(env, botSlug, templateKey, variables = {}) {
  const definition = MESSAGE_TEMPLATE_DEFINITIONS[botSlug]?.templates?.[templateKey];
  if (!definition) return null;
  const { data: bot, error: botError } = await getSupabase(env)
    .from("bots").select("id,name").eq("slug",botSlug).maybeSingle();
  if (botError) throw botError;
  if (!bot) return null;
  const { data: row, error } = await getSupabase(env)
    .from("bot_settings").select("setting_value").eq("bot_id",bot.id).eq("setting_key","message_templates").maybeSingle();
  if (error) throw error;
  const value = typeof row?.setting_value?.[templateKey] === "string"
    ? row.setting_value[templateKey]
    : definition.defaultValue;
  return renderMessageTemplate(value, {
    bot_name: bot.name || (botSlug === "findly" ? "FINDLY" : "FINDLY Movies"),
    welcome_text: botSlug === "findly"
      ? "اختار الخدمة اللي بغيتي من القائمة:"
      : "اكتشف الأفلام والمسلسلات واختر ما تريد مشاهدته.",
    ...variables
  });
}
