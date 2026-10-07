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
  return telegramRequest(
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

export async function setWebhook(
  env,
  botSlug,
  webhookUrl
) {
  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    throw new Error(
      "TELEGRAM_WEBHOOK_SECRET is missing"
    );
  }

  return telegramRequest(
    env,
    botSlug,
    "setWebhook",
    {
      url: webhookUrl,
      secret_token:
        env.TELEGRAM_WEBHOOK_SECRET,
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
