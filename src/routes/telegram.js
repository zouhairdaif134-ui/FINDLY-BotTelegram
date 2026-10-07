import { getSupabase } from "../lib/supabase.js";
import {
  sendMessage,
  answerCallback
} from "../lib/telegram.js";
import {
  showJobsCategory,
  showSharedJob,
  handleJobsCallback
} from "../lib/jobs-ui.js";
import { generateAIReply } from "../lib/ai.js";

async function getBot(
  env,
  botSlug
) {
  const supabase = getSupabase(env);

  const { data, error } =
    await supabase
      .from("bots")
      .select(
        "id, name, slug, bot_type, telegram_username, description, icon, is_active, sort_order"
      )
      .eq("slug", botSlug)
      .single();

  if (error) {
    throw error;
  }

  if (!data || !data.is_active) {
    throw new Error(
      "Telegram bot is inactive or not found"
    );
  }

  return data;
}

async function getMasterBot(
  env
) {
  const supabase = getSupabase(env);

  const { data, error } =
    await supabase
      .from("bots")
      .select(
        "id, name, slug, bot_type, telegram_username, description, icon, is_active, sort_order"
      )
      .eq("bot_type", "master")
      .eq("is_active", true)
      .single();

  if (error) {
    throw error;
  }

  return data;
}

async function getChildBots(
  env
) {
  const supabase = getSupabase(env);

  const { data, error } =
    await supabase
      .from("bots")
      .select(
        "id, name, slug, bot_type, telegram_username, description, icon, is_active, sort_order"
      )
      .eq("bot_type", "child")
      .eq("is_active", true)
      .order("sort_order", {
        ascending: true
      });

  if (error) {
    throw error;
  }

  return data || [];
}


async function claimTelegramUpdate(
  env,
  bot,
  update
) {
  const updateId = update?.update_id;

  if (
    !Number.isSafeInteger(updateId) ||
    updateId < 0
  ) {
    throw new Error(
      "Telegram update_id is required"
    );
  }

  const supabase = getSupabase(env);

  const updateType =
    update.callback_query
      ? "callback_query"
      : update.message
        ? "message"
        : update.edited_message
          ? "edited_message"
          : update.channel_post
            ? "channel_post"
            : update.edited_channel_post
              ? "edited_channel_post"
              : "other";

  const {
    data,
    error
  } = await supabase.rpc(
    "claim_telegram_update",
    {
      p_bot_id: bot.id,
      p_update_id: updateId,
      p_update_type: updateType,
      p_stale_after_seconds: 120
    }
  );

  if (error) {
    throw error;
  }

  const claim = Array.isArray(data)
    ? data[0]
    : data;

  if (!claim?.record_id) {
    throw new Error(
      "Telegram update claim could not be verified"
    );
  }

  return {
    claimed: Boolean(
      claim.claimed
    ),
    recordId: claim.record_id,
    duplicate: Boolean(
      claim.duplicate
    ),
    inProgress: Boolean(
      claim.in_progress
    )
  };
}
async function markTelegramUpdateProcessed(
  env,
  recordId
) {
  const supabase = getSupabase(env);

  const { error } =
    await supabase
      .from("telegram_updates")
      .update({
        status: "processed",
        error_message: null,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq(
        "id",
        recordId
      );

  if (error) {
    throw error;
  }
}

async function markTelegramUpdateFailed(
  env,
  recordId,
  error
) {
  const supabase = getSupabase(env);

  const message =
    error?.message ||
    "Telegram update processing failed";

  const { error: updateError } =
    await supabase
      .from("telegram_updates")
      .update({
        status: "failed",
        error_message: message.slice(0, 1000),
        processed_at: null,
        updated_at: new Date().toISOString()
      })
      .eq(
        "id",
        recordId
      );

  if (updateError) {
    console.error(
      updateError
    );
  }
}

async function saveTelegramUser(
  env,
  bot,
  telegramUser
) {
  if (!telegramUser?.id) {
    console.warn("Telegram user missing from update:", {
      botSlug: bot?.slug || null
    });
    return null;
  }

  const supabase = getSupabase(env);

  const telegramUserId =
    String(telegramUser.id);

  console.log("Telegram user save started:", {
    botSlug: bot?.slug || null,
    telegramUserId
  });

  const { data: existingUser, error: lookupError } =
    await supabase
      .from("telegram_users")
      .select(
        "id, telegram_user_id"
      )
      .eq(
        "telegram_user_id",
        telegramUserId
      )
      .maybeSingle();

  if (lookupError) {
    console.error("Telegram user lookup failed:", {
      botSlug: bot?.slug || null,
      telegramUserId,
      code: lookupError.code || null,
      message: lookupError.message || "Unknown error",
      details: lookupError.details || null,
      hint: lookupError.hint || null
    });
    throw lookupError;
  }

  console.log("Telegram user lookup completed:", {
    botSlug: bot?.slug || null,
    telegramUserId,
    found: Boolean(existingUser)
  });

  let user;

  if (existingUser) {
    const { data, error } =
      await supabase
        .from("telegram_users")
        .update({
          username:
            telegramUser.username ||
            null,
          first_name:
            telegramUser.first_name ||
            null,
          last_name:
            telegramUser.last_name ||
            null,
          language_code:
            telegramUser.language_code ||
            null,
          is_active: true,
          last_seen_at:
            new Date().toISOString()
        })
        .eq(
          "id",
          existingUser.id
        )
        .select(
          "id, telegram_user_id"
        )
        .single();

    if (error) {
      throw error;
    }

    user = data;
  } else {
    const { data, error } =
      await supabase
        .from("telegram_users")
        .insert({
          telegram_user_id:
            telegramUserId,
          username:
            telegramUser.username ||
            null,
          first_name:
            telegramUser.first_name ||
            null,
          last_name:
            telegramUser.last_name ||
            null,
          language_code:
            telegramUser.language_code ||
            null,
          is_active: true,
          first_seen_at:
            new Date().toISOString(),
          last_seen_at:
            new Date().toISOString()
        })
        .select(
          "id, telegram_user_id"
        )
        .single();

    if (error) {
      throw error;
    }

    user = data;
  }

  if (!user?.id || !bot?.id) {
    return user;
  }

  const { data: existingRelation, error: relationLookupError } =
    await supabase
      .from("user_bots")
      .select(
        "user_id, bot_id"
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "bot_id",
        bot.id
      )
      .maybeSingle();

  if (relationLookupError) {
    console.error("Telegram user-bot lookup failed:", {
      botSlug: bot?.slug || null,
      userId: user.id,
      botId: bot.id,
      code: relationLookupError.code || null,
      message: relationLookupError.message || "Unknown error",
      details: relationLookupError.details || null,
      hint: relationLookupError.hint || null
    });
    throw relationLookupError;
  }

  if (!existingRelation) {
    const { error } =
      await supabase
        .from("user_bots")
        .insert({
          user_id: user.id,
          bot_id: bot.id
        });

    if (error) {
      console.error("Telegram user-bot insert failed:", {
        botSlug: bot?.slug || null,
        userId: user.id,
        botId: bot.id,
        code: error.code || null,
        message: error.message || "Unknown error",
        details: error.details || null,
        hint: error.hint || null
      });
      throw error;
    }
  }

  console.log("Telegram user save completed:", {
    botSlug: bot?.slug || null,
    telegramUserId,
    userId: user.id,
    botId: bot.id
  });

  return user;
}

async function recordAnalytics(
  env,
  bot,
  telegramUser,
  eventType,
  eventData = {}
) {
  if (!bot?.id || !eventType) {
    return;
  }

  const supabase = getSupabase(env);

  const { data: user } =
    telegramUser?.id
      ? await supabase
          .from("telegram_users")
          .select("id")
          .eq(
            "telegram_user_id",
            String(telegramUser.id)
          )
          .maybeSingle()
      : { data: null };

  const { error } =
    await supabase
      .from("analytics_events")
      .insert({
        user_id: user?.id || null,
        bot_id: bot.id,
        event_type: eventType,
        event_data: eventData
      });

  if (error) {
    console.error(
      "Analytics event failed:",
      error
    );
  }
}

function escapeHtml(
  value
) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function sendMasterMenu(
  env,
  bot,
  chatId,
  telegramUser = null
) {
  const supabase = getSupabase(env);

  const { data: menus, error } =
    await supabase
      .from("menu_items")
      .select(
        "id, bot_id, parent_id, label, icon, action_type, action_value, is_active, sort_order"
      )
      .eq("bot_id", bot.id)
      .is("parent_id", null)
      .eq("is_active", true)
      .order("sort_order", {
        ascending: true
      })
      .order("created_at", {
        ascending: true
      });

  if (error) {
    throw error;
  }

  const keyboard = (menus || []).map((item) => {
    const button = {
      text: `${item.icon || "🔘"} ${item.label}`
    };

    if (
      item.action_type === "url" &&
      item.action_value
    ) {
      button.url = item.action_value;
    } else {
      button.callback_data = `menu:${item.id}`;
    }

    return [button];
  });

  await recordAnalytics(
    env,
    bot,
    telegramUser,
    "master_menu_viewed",
    {
      chat_id: chatId,
      menu_items: (menus || []).length
    }
  );

  await sendMessage(
    env,
    bot.slug,
    chatId,
    "<b>" +
      (bot.icon || "🤖") +
      " " +
      bot.name +
      "</b>\n\n" +
      "اختار الخدمة اللي بغيتي:",
    {
      reply_markup: {
        inline_keyboard: keyboard
      }
    }
  );
}

async function sendHomeButton(
  env,
  botSlug
) {
  const master =
    await getMasterBot(env);

  if (
    !master ||
    !master.telegram_username
  ) {
    return null;
  }

  return {
    text: "🏠 FINDLY",
    url:
      `https://t.me/` +
      master.telegram_username.replace(
        /^@/,
        ""
      )
  };
}

async function sendMenuLevel(env, bot, chatId, parentId = null) {
  const supabase = getSupabase(env);
  let query = supabase.from("menu_items").select("id, bot_id, parent_id, label, icon, action_type, action_value, is_active, sort_order").eq("bot_id", bot.id).eq("is_active", true).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);
  const { data: menus, error } = await query;
  if (error) throw error;
  const keyboard = [];
  for (const item of menus || []) {
    if (item.action_type === "url" && item.action_value) {
      keyboard.push([{ text: `${item.icon || "🔘"} ${item.label}`, url: item.action_value }]);
    } else {
      keyboard.push([{ text: `${item.icon || "🔘"} ${item.label}`, callback_data: `menu:${item.id}` }]);
    }
  }
  if (parentId) {
    const { data: parent, error: parentError } = await supabase.from("menu_items").select("parent_id").eq("id", parentId).eq("bot_id", bot.id).maybeSingle();
    if (parentError) throw parentError;
    keyboard.push([{ text: "⬅️ رجوع", callback_data: parent?.parent_id ? `menuback:${parent.parent_id}` : "menuback:root" }]);
  }
  const homeButton = await sendHomeButton(env, bot.slug);
  if (homeButton) keyboard.push([homeButton]);
  await sendMessage(env, bot.slug, chatId, `<b>${escapeHtml(bot.icon || "🤖")} ${escapeHtml(bot.name)}</b>\n\n` + escapeHtml(parentId ? "اختار من القائمة:" : bot.description || "اختار من القائمة:"), { reply_markup: { inline_keyboard: keyboard } });
}

async function sendChildMenu(env, bot, chatId) {
  return sendMenuLevel(env, bot, chatId, null);
}
async function sendCategory(
  env,
  bot,
  chatId,
  categorySlug
) {
  const supabase = getSupabase(env);

  const { data: category, error } =
    await supabase
      .from("categories")
      .select(
        "id, name, slug, icon, description, is_active"
      )
      .eq(
        "slug",
        categorySlug
      )
      .eq(
        "is_active",
        true
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (!category) {
    await sendMessage(
      env,
      bot.slug,
      chatId,
      "ما لقيتش هاد القسم."
    );

    return;
  }

  const { data: content, error: contentError } =
    await supabase
      .from("content_items")
      .select(
        "id, content_type, title, description, image_url, external_url, metadata, published_at"
      )
      .eq(
        "bot_id",
        bot.id
      )
      .eq(
        "category_id",
        category.id
      )
      .eq(
        "is_active",
        true
      )
      .order(
        "published_at",
        {
          ascending: false,
          nullsFirst: false
        }
      )
      .order(
        "created_at",
        {
          ascending: false
        })
      .limit(10);

  if (contentError) {
    throw contentError;
  }

  const lines = [
    `<b>${escapeHtml(
      category.icon || "📁"
    )} ${escapeHtml(
      category.name
    )}</b>`
  ];

  if (category.description) {
    lines.push(
      "",
      escapeHtml(
        category.description
      )
    );
  }

  if (
    !content ||
    content.length === 0
  ) {
    lines.push(
      "",
      "حالياً ما كاين حتى محتوى فهاد القسم."
    );
  } else {
    lines.push("");

    content.forEach(
      (item, index) => {
        lines.push(
          `<b>${index + 1}. ${escapeHtml(
            item.title
          )}</b>`
        );

        if (item.description) {
          lines.push(
            escapeHtml(
              item.description
            )
          );
        }

        if (item.external_url) {
          lines.push(
            `<a href="${escapeHtml(
              item.external_url
            )}">🔗 فتح الرابط</a>`
          );
        }

        lines.push("");
      }
    );
  }

  const homeButton =
    await sendHomeButton(
      env,
      bot.slug
    );

  const keyboard = [];

  if (homeButton) {
    keyboard.push([
      homeButton
    ]);
  }

  await sendMessage(
    env,
    bot.slug,
    chatId,
    lines.join("\n"),
    {
      reply_markup: {
        inline_keyboard:
          keyboard
      }
    }
  );
}

async function handleMenuCallback(
  env,
  bot,
  chatId,
  callbackQuery
) {
  if (callbackQuery.data?.startsWith("jobs:")) {
    await handleJobsCallback(env, bot, chatId, callbackQuery);
    return;
  }

  if (callbackQuery.data?.startsWith("menuback:")) {
    const target = callbackQuery.data.slice("menuback:".length);
    await answerCallback(env, bot.slug, callbackQuery.id);
    await sendMenuLevel(env, bot, chatId, target === "root" ? null : target);
    return;
  }

  const menuId =
    callbackQuery.data?.startsWith(
      "menu:"
    )
      ? callbackQuery.data.slice(5)
      : null;

  if (!menuId) {
    return;
  }

  const supabase = getSupabase(env);

  const { data: item, error } =
    await supabase
      .from("menu_items")
      .select(
        "id, bot_id, parent_id, label, icon, action_type, action_value, is_active"
      )
      .eq(
        "id",
        menuId
      )
      .eq(
        "bot_id",
        bot.id
      )
      .eq(
        "is_active",
        true
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (!item) {
    await answerCallback(
      env,
      bot.slug,
      callbackQuery.id,
      "هاد الاختيار ما بقاش متاح."
    );

    return;
  }

  await answerCallback(
    env,
    bot.slug,
    callbackQuery.id
  );

  await recordAnalytics(
    env,
    bot,
    callbackQuery.from,
    "menu_item_clicked",
    {
      menu_item_id: item.id,
      label: item.label,
      action_type: item.action_type,
      action_value: item.action_value || null
    }
  );

  if (
    item.action_type ===
      "premium"
  ) {
    await recordAnalytics(
      env,
      bot,
      callbackQuery.from,
      "premium_viewed",
      {
        menu_item_id: item.id
      }
    );

    await sendMessage(
      env,
      bot.slug,
      chatId,
      "<b>💎 FINDLY Premium</b>\n\n" +
        "Premium غادي يفتح لك مزايا وخدمات إضافية داخل FINDLY.\n\n" +
        "🚧 الاشتراك كيتوجد حالياً وغادي يتفعل من بعد عبر Telegram Stars."
    );

    return;
  }

  if (
    item.action_type ===
      "help"
  ) {
    await sendMessage(
      env,
      bot.slug,
      chatId,
      "<b>ℹ️ المساعدة</b>\n\n" +
        "استعمل /start باش ترجع للقائمة الرئيسية، " +
        "واختار الخدمة اللي بغيتي من الأزرار."
    );

    return;
  }

  if (
    item.action_type ===
      "ai"
  ) {
    await sendMessage(
      env,
      bot.slug,
      chatId,
      "<b>🤖 المساعد الذكي</b>\n\n" +
        "كتب ليا سؤالك مباشرة، وأنا نحاول نعاونك."
    );

    return;
  }

  if (
    item.action_type ===
      "search"
  ) {
    await sendMessage(
      env,
      bot.slug,
      chatId,
      "<b>🔎 البحث</b>\n\n" +
        "كتب ليا شنو بغيتي تقلب عليه، وغادي نجهزو ليك البحث داخل FINDLY."
    );

    return;
  }

  if (
    item.action_type ===
      "category" &&
    item.action_value
  ) {
    if (item.action_value === "jobs") {
      await showJobsCategory(
        env,
        bot,
        chatId
      );
    } else {
      await sendCategory(
        env,
        bot,
        chatId,
        item.action_value
      );
    }

    return;
  }

  if (
    item.action_type ===
      "content" &&
    item.action_value
  ) {
    const { data: content } =
      await supabase
        .from("content_items")
        .select(
          "title, description, external_url"
        )
        .eq(
          "id",
          item.action_value
        )
        .eq(
          "bot_id",
          bot.id
        )
        .eq(
          "is_active",
          true
        )
        .maybeSingle();

    if (!content) {
      await sendMessage(
        env,
        bot.slug,
        chatId,
        "المحتوى ما بقاش متاح."
      );

      return;
    }

    let text =
      `<b>${escapeHtml(
        content.title
      )}</b>`;

    if (content.description) {
      text +=
        `\n\n${escapeHtml(
          content.description
        )}`;
    }

    const keyboard = [];

    if (
      content.external_url
    ) {
      keyboard.push([
        {
          text: "🔗 فتح الرابط",
          url: content.external_url
        }
      ]);
    }

    const homeButton =
      await sendHomeButton(
        env,
        bot.slug
      );

    if (homeButton) {
      keyboard.push([
        homeButton
      ]);
    }

    await sendMessage(
      env,
      bot.slug,
      chatId,
      text,
      {
        reply_markup: {
          inline_keyboard:
            keyboard
        }
      }
    );

    return;
  }

  if (
    item.action_type ===
      "url" &&
    item.action_value
  ) {
    await sendMessage(
      env,
      bot.slug,
      chatId,
      `<b>${escapeHtml(
        item.label
      )}</b>\n\n${escapeHtml(
        item.action_value
      )}`
    );

    return;
  }

  if (
    item.action_type ===
      "menu"
  ) {
    await sendMenuLevel(
      env,
      bot,
      chatId,
      item.id
    );

    return;
  }

  await sendMessage(
    env,
    bot.slug,
    chatId,
    "هاد الاختيار مازال ما تبرمجش."
  );
}

export async function handleTelegramUpdate(
  env,
  botSlug,
  update
) {
  const bot =
    await getBot(
      env,
      botSlug
    );

  const claim =
    await claimTelegramUpdate(
      env,
      bot,
      update
    );

  if (
    !claim.claimed
  ) {
    return {
      ok: true,
      duplicate: Boolean(
        claim.duplicate
      ),
      in_progress: Boolean(
        claim.inProgress
      )
    };
  }

  try {
    const result =
      await processTelegramUpdate(
        env,
        bot,
        update,
        claim.recordId
      );

    await markTelegramUpdateProcessed(
      env,
      claim.recordId
    );

    return result;
  } catch (error) {
    await markTelegramUpdateFailed(
      env,
      claim.recordId,
      error
    );

    throw error;
  }
}

async function processTelegramUpdate(
  env,
  bot,
  update,
  recordId
) {
  console.log("Telegram update processing started:", {
    botSlug: bot?.slug || null,
    update_id: update?.update_id ?? null,
    recordId
  });

  const message =
    update.message;

  const callbackQuery =
    update.callback_query;

  const telegramUser =
    message?.from ||
    callbackQuery?.from;

  await saveTelegramUser(
    env,
    bot,
    telegramUser
  );

  console.log("Telegram user stage completed:", {
    botSlug: bot?.slug || null,
    update_id: update?.update_id ?? null,
    recordId
  });

  await recordAnalytics(
    env,
    bot,
    telegramUser,
    callbackQuery
      ? "callback_query"
      : message
        ? "message"
        : "update",
    {
      update_id:
        update?.update_id ?? null,
      action:
        callbackQuery?.data || null,
      command:
        message?.text?.startsWith("/")
          ? message.text
          : null
    }
  );

  console.log("Telegram analytics stage completed:", {
    botSlug: bot?.slug || null,
    update_id: update?.update_id ?? null,
    recordId
  });

  if (callbackQuery) {
    const chatId =
      callbackQuery.message?.chat?.id;

    if (!chatId) {
      return {
        ok: true
      };
    }

    await handleMenuCallback(
      env,
      bot,
      chatId,
      callbackQuery
    );

    return {
      ok: true
    };
  }

  if (!message) {
    return {
      ok: true
    };
  }

  const chatId =
    message.chat?.id;

  if (!chatId) {
    return {
      ok: true
    };
  }

  const text =
    message.text || "";

  if (
    text === "/start" ||
    text.startsWith("/start ")
  ) {
    const startPayload = text.slice("/start".length).trim();

    if (startPayload.startsWith("job_")) {
      const sharedJobId = startPayload.slice("job_".length);

      if (bot.bot_type === "master") {
        await showSharedJob(
          env,
          bot,
          chatId,
          sharedJobId
        );

        return {
          ok: true
        };
      }
    }
    if (
      bot.bot_type ===
      "master"
    ) {
      console.log("Telegram /start master handler:", {
        botSlug: bot.slug,
        update_id: update?.update_id ?? null,
        chatId
      });

      await sendMasterMenu(
        env,
        bot,
        chatId,
        telegramUser
      );
    } else {
      await sendChildMenu(
        env,
        bot,
        chatId
      );
    }

    return {
      ok: true
    };
  }

  if (
    text === "/help"
  ) {
    await sendMessage(
      env,
      bot.slug,
      chatId,
      "<b>ℹ️ المساعدة</b>\n\n" +
        "استعمل /start باش ترجع للقائمة الرئيسية."
    );

    return {
      ok: true
    };
  }

  try {
    const aiReply = await generateAIReply(
      env,
      bot,
      text
    );

    if (aiReply) {
      await sendMessage(
        env,
        bot.slug,
        chatId,
        escapeHtml(aiReply)
      );

      await recordAnalytics(
        env,
        bot,
        telegramUser,
        "ai_message",
        {
          update_id:
            update?.update_id ?? null
        }
      );

      return {
        ok: true,
        ai: true
      };
    }
  } catch (error) {
    console.error("AI reply failed:", error);
    await sendMessage(
      env,
      bot.slug,
      chatId,
      "وقع مشكل مؤقت فالمساعد الذكي. حاول من بعد."
    );
    return {
      ok: true,
      ai: false,
      error: "ai_unavailable"
    };
  }

  if (
    bot.bot_type ===
    "master"
  ) {
    await sendMasterMenu(
      env,
      bot,
      chatId,
      telegramUser
    );
  } else {
    await sendChildMenu(
      env,
      bot,
      chatId
    );
  }

  return {
    ok: true
  };
}
