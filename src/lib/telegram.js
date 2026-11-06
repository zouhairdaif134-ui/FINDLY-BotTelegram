const TELEGRAM_API = "https://api.telegram.org";

function getBotTokens(env) {
  if (!env.TELEGRAM_BOT_TOKENS) {
    const error = new Error("TELEGRAM_BOT_TOKENS is missing");
    error.code = "TELEGRAM_CONFIG_ERROR";
    throw error;
  }

  let tokens;

  try {
    tokens = JSON.parse(env.TELEGRAM_BOT_TOKENS);
  } catch {
    const error = new Error(
      "TELEGRAM_BOT_TOKENS must contain valid JSON"
    );
    error.code = "TELEGRAM_CONFIG_ERROR";
    throw error;
  }

  return tokens;
}

export function getTelegramToken(env, botSlug) {
  if (botSlug === "movies") {
    if (!env.TELEGRAM_MOVIES_BOT_TOKEN) {
      const error = new Error("Telegram token is not configured for bot: movies");
      error.code = "TELEGRAM_CONFIG_ERROR";
      throw error;
    }
    return env.TELEGRAM_MOVIES_BOT_TOKEN;
  }

  const tokens = getBotTokens(env);
  const token = tokens[botSlug];

  if (!token) {
    const error = new Error(
      `Telegram token is not configured for bot: ${botSlug}`
    );
    error.code = "TELEGRAM_CONFIG_ERROR";
    throw error;
  }

  return token;
}

export async function telegramRequest(
  env,
  botSlug,
  method,
  payload = {}
) {
  const token = getTelegramToken(
    env,
    botSlug
  );

  const response = await fetch(
    `${TELEGRAM_API}/bot${token}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json();

  if (!data.ok) {
    const error = new Error(
      data.description ||
        `Telegram API error: ${method}`
    );
    error.code = "TELEGRAM_API_ERROR";
    error.status = response.status;
    throw error;
  }

  return data.result;
}

export async function sendPhoto(env, botSlug, chatId, photoUrl, options = {}) {
  let parsedUrl;
  try { parsedUrl = new URL(photoUrl); } catch { throw new Error("Unsupported poster URL"); }
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "image.tmdb.org" || !parsedUrl.pathname.startsWith("/t/p/")) throw new Error("Unsupported poster URL");
  const token = getTelegramToken(env, botSlug);
  let imageResponse;
  let downloadError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      imageResponse = await fetch(parsedUrl.toString(), { headers: { Accept: "image/*" } });
      if (!imageResponse.ok) throw new Error("TMDB poster download failed (" + imageResponse.status + ")");
      if (!String(imageResponse.headers.get("content-type") || "").toLowerCase().startsWith("image/")) throw new Error("TMDB poster response is not an image");
      break;
    } catch (error) { downloadError = error; imageResponse = null; }
  }
  if (!imageResponse) throw new Error("Unable to retrieve the required movie poster: " + (downloadError?.message || "unknown error"));
  const imageBlob = await imageResponse.blob();
  if (!imageBlob.size) throw new Error("TMDB returned an empty movie poster");
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("photo", imageBlob, "findly-poster");
  if (options.caption) form.append("caption", options.caption);
  if (options.parse_mode) form.append("parse_mode", options.parse_mode);
  if (options.reply_markup) form.append("reply_markup", JSON.stringify(options.reply_markup));
  const response = await fetch("https://api.telegram.org/bot" + token + "/sendPhoto", { method: "POST", body: form });
  const data = await response.json();
  if (!data.ok) { const error = new Error(data.description || "Telegram photo upload failed"); error.code = "TELEGRAM_API_ERROR"; error.status = response.status; throw error; }
  return data.result;
}
export async function sendMessage(
  env,
  botSlug,
  chatId,
  text,
  options = {}
) {
  return telegramRequest(
    env,
    botSlug,
    "sendMessage",
    {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...options
    }
  );
}

export async function editMessageText(
  env,
  botSlug,
  chatId,
  messageId,
  text,
  options = {}
) {
  try {
    return await telegramRequest(
      env,
      botSlug,
      "editMessageText",
      {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...options
      }
    );
  } catch (error) {
    if (
      error?.code === "TELEGRAM_API_ERROR" &&
      String(error.message || "").toLowerCase().includes("message is not modified")
    ) {
      return null;
    }

    throw error;
  }
}

export async function answerCallback(
  env,
  botSlug,
  callbackQueryId,
  text = ""
) {
  return telegramRequest(
    env,
    botSlug,
    "answerCallbackQuery",
    {
      callback_query_id:
        callbackQueryId,
      text
    }
  );
}

export function getTelegramWebhookSecret(env, botSlug) {
  const secret = botSlug === "movies"
    ? env.TELEGRAM_MOVIES_WEBHOOK_SECRET
    : env.TELEGRAM_WEBHOOK_SECRET;

  if (!secret) {
    const variable = botSlug === "movies"
      ? "TELEGRAM_MOVIES_WEBHOOK_SECRET"
      : "TELEGRAM_WEBHOOK_SECRET";
    const error = new Error(`${variable} is missing`);
    error.code = "TELEGRAM_CONFIG_ERROR";
    throw error;
  }

  return secret;
}

export async function setWebhook(
  env,
  botSlug,
  webhookUrl
) {
  return telegramRequest(
    env,
    botSlug,
    "setWebhook",
    {
      url: webhookUrl,
      secret_token: getTelegramWebhookSecret(env, botSlug),
      allowed_updates: [
        "message",
        "callback_query"
      ]
    }
  );
}

export async function getWebhookInfo(
  env,
  botSlug
) {
  return telegramRequest(
    env,
    botSlug,
    "getWebhookInfo"
  );
}

export async function deleteWebhook(
  env,
  botSlug
) {
  return telegramRequest(
    env,
    botSlug,
    "deleteWebhook",
    {
      drop_pending_updates: false
    }
  );
}
