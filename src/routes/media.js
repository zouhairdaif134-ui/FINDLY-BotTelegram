import { getSupabase } from "../lib/supabase.js";
import { telegramRequest } from "../lib/telegram.js";
import { recordAdminEvent, recordAdminFailure } from "../lib/admin-audit.js";

const PERMISSION = "media.manage";
const ASSET_STATUSES = new Set(["pending_review", "active", "inactive", "rejected"]);
const RIGHTS_STATUSES = new Set(["unverified", "authorized", "not_authorized"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeError(message, status = 400, code = "BAD_REQUEST") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeUsername(value) {
  return String(value || "").trim().replace(/^@/, "").toLowerCase();
}

function validateChatReference(value) {
  const reference = String(value || "").trim();
  if (!/^-?\d{5,20}$/.test(reference) && !/^@[A-Za-z0-9_]{5,32}$/.test(reference)) {
    throw makeError("أدخل معرّف القناة الرقمي أو اسمها بصيغة @channel_name.");
  }
  return reference;
}

export async function verifyMovieStorageChannel({
  chatId,
  configuredUsername,
  telegram
}) {
  const reference = validateChatReference(chatId);
  if (typeof telegram !== "function") {
    throw makeError("تعذر تهيئة اتصال Telegram.", 500, "TELEGRAM_CONFIG_ERROR");
  }

  const [identity, chat, webhook] = await Promise.all([
    telegram("getMe"),
    telegram("getChat", { chat_id: reference }),
    telegram("getWebhookInfo")
  ]);

  if (!identity?.is_bot || !identity?.id || !identity?.username) {
    throw makeError("تعذر التحقق من هوية Watch Bot.", 502, "TELEGRAM_IDENTITY_ERROR");
  }

  const expectedUsername = normalizeUsername(configuredUsername);
  if (!expectedUsername || normalizeUsername(identity.username) !== expectedUsername) {
    throw makeError("هوية Watch Bot لا تطابق اسم المستخدم المسجل في FINDLY.", 409, "TELEGRAM_IDENTITY_MISMATCH");
  }

  if (chat?.type !== "channel" || !chat?.id) {
    throw makeError("المعرّف المدخل لا يشير إلى قناة Telegram.", 400, "INVALID_STORAGE_CHANNEL");
  }

  const member = await telegram("getChatMember", {
    chat_id: chat.id,
    user_id: identity.id
  });

  if (!["administrator", "creator"].includes(member?.status)) {
    throw makeError("يجب إضافة Watch Bot إلى القناة ومنحه صلاحية مشرف.", 409, "TELEGRAM_BOT_NOT_CHANNEL_ADMIN");
  }

  if (!webhook?.url) {
    throw makeError("Webhook ديال Watch Bot غير متصل. اربط البوت أولاً من قسم Telegram.", 409, "TELEGRAM_WEBHOOK_MISSING");
  }

  const allowedUpdates = Array.isArray(webhook.allowed_updates) ? webhook.allowed_updates : [];
  const receivesChannelPosts = allowedUpdates.length === 0 || allowedUpdates.includes("channel_post");
  if (!receivesChannelPosts) {
    throw makeError("Webhook ديال Watch Bot لا يستقبل channel_post. أعد ربط Webhook من قسم Telegram.", 409, "TELEGRAM_CHANNEL_POST_DISABLED");
  }

  return {
    chat_id: String(chat.id),
    title: chat.title || chat.username || "Telegram Channel",
    username: chat.username || null,
    bot_username: identity.username,
    bot_status: member.status,
    webhook_url: webhook.url,
    receives_channel_posts: receivesChannelPosts
  };
}

async function getMoviesBot(env) {
  const { data, error } = await getSupabase(env)
    .from("bots")
    .select("telegram_username")
    .eq("slug", "movies")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw makeError("سجل Watch Bot غير موجود أو غير مفعّل.", 409, "WATCH_BOT_UNAVAILABLE");
  return data;
}

async function verifyConfiguredStorageChannel(env, chatId) {
  const bot = await getMoviesBot(env);
  return verifyMovieStorageChannel({
    chatId,
    configuredUsername: bot.telegram_username,
    telegram: (method, payload) => telegramRequest(env, "movies", method, payload)
  });
}

async function readStorageConfig(supabase) {
  const { data, error } = await supabase
    .from("movie_media_storage_config")
    .select("id,active_storage_chat_id,active_channel_title,updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function auditEvent(env, auth, event) {
  try {
    await recordAdminEvent(env, auth, event);
    return true;
  } catch (error) {
    console.error("FINDLY media audit event could not be saved:", {
      action: event.action,
      code: error?.code || null
    });
    await recordAdminFailure(env, auth, {
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId || null,
      failureCode: error?.code || "MEDIA_AUDIT_FAILED",
      failureType: error?.name || "Error"
    });
    return false;
  }
}

function send(helpers, request, data) {
  return helpers.withCors(helpers.success(data), request);
}

function sendFailure(helpers, request, error) {
  const status = error?.code === "TELEGRAM_API_ERROR" ? 502 : Number(error?.status) ||
    (error?.code === "PGRST116" ? 404 : error?.code === "23505" ? 409 : error?.code ? 500 : 400);
  const code = status === 404 ? "NOT_FOUND" :
    status === 409 ? (error?.code || "CONFLICT") :
      status >= 500 ? "MEDIA_OPERATION_FAILED" : "BAD_REQUEST";
  const message = status >= 500
    ? "تعذر تنفيذ عملية الوسائط. راجع سجل الأخطاء باستعمال المرجع التقني."
    : error?.message || "طلب غير صالح.";
  return helpers.withCors(helpers.failure(code, message, status), request);
}

async function authorize(env, request, helpers) {
  const result = await helpers.requirePermission(env, request, PERMISSION);
  if (result.response) return { response: helpers.withCors(result.response, request) };
  return { auth: result };
}

async function listAssets(env, status) {
  if (status && status !== "all" && !ASSET_STATUSES.has(status)) {
    throw makeError("حالة الوسيط المطلوبة غير صالحة.");
  }
  let query = getSupabase(env)
    .from("movie_media_assets")
    .select("id,title_id,storage_message_id,media_type,file_size,file_name,mime_type,quality_label,status,created_at,movie_titles(title,release_year,media_type,distribution_rights_status)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status && status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function updateAssetStatus(env, assetId, nextStatus) {
  if (!UUID_RE.test(assetId || "")) throw makeError("معرّف الوسيط غير صالح.");
  const supabase = getSupabase(env);
  const { data: current, error: lookupError } = await supabase
    .from("movie_media_assets")
    .select("id,title_id,status")
    .eq("id", assetId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!current) throw makeError("الوسيط غير موجود.", 404, "NOT_FOUND");

  const allowedTransitions = {
    pending_review: ["active", "rejected"],
    active: ["inactive"],
    inactive: [],
    rejected: []
  };
  if (!allowedTransitions[current.status]?.includes(nextStatus)) {
    throw makeError("لا يمكن تنفيذ هذا التغيير انطلاقاً من الحالة الحالية.", 409, "INVALID_MEDIA_TRANSITION");
  }

  const { data, error } = await supabase
    .from("movie_media_assets")
    .update({ status: nextStatus })
    .eq("id", assetId)
    .eq("status", current.status)
    .select("id,title_id,status")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw makeError("تغيّرت حالة الوسيط أثناء العملية. حدّث القائمة وحاول مجدداً.", 409, "MEDIA_STATE_CHANGED");
  return data;
}

async function updateDistributionRights(env, titleId, body, auth) {
  if (!UUID_RE.test(titleId || "")) throw makeError("معرّف العنوان غير صالح.");
  const status = body?.status;
  if (!RIGHTS_STATUSES.has(status)) throw makeError("حالة حقوق التوزيع غير صالحة.");
  if (status !== "unverified" && body?.confirmation !== true) {
    throw makeError("خاص تأكد العملية صراحةً قبل تغيير حالة حقوق التوزيع.");
  }

  const reviewedAt = status === "unverified" ? null : new Date().toISOString();
  const reviewedBy = status === "unverified" ? null : auth.userId;
  const { data, error } = await getSupabase(env)
    .from("movie_titles")
    .update({
      distribution_rights_status: status,
      distribution_rights_reviewed_at: reviewedAt,
      distribution_rights_reviewed_by: reviewedBy
    })
    .eq("id", titleId)
    .select("id,title,distribution_rights_status,distribution_rights_reviewed_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw makeError("العنوان غير موجود.", 404, "NOT_FOUND");
  return data;
}

export async function handleMediaRoute(env, request, url, helpers) {
  if (url.pathname !== "/api/media" && !url.pathname.startsWith("/api/media/")) return null;
  const parts = url.pathname.split("/").filter(Boolean).slice(2);
  const [resource, id, action] = parts;
  let auth = null;
  let auditAction = "media.operation";
  let entityType = "movie";
  let entityId = null;

  try {
    const authorized = await authorize(env, request, helpers);
    if (authorized.response) return authorized.response;
    auth = authorized.auth;

    if (resource === "assets" && parts.length === 1 && request.method === "GET") {
      return send(helpers, request, await listAssets(env, url.searchParams.get("status") || "pending_review"));
    }

    if (resource === "storage-channel" && parts.length === 1 && request.method === "GET") {
      return send(helpers, request, await readStorageConfig(getSupabase(env)));
    }

    if (resource === "storage-channel" && parts.length === 2 && id === "test" && request.method === "POST") {
      const body = await helpers.readJson(request);
      const verified = await verifyConfiguredStorageChannel(env, body?.chat_id);
      return send(helpers, request, verified);
    }

    if (resource === "storage-channel" && parts.length === 1 && request.method === "PUT") {
      const body = await helpers.readJson(request);
      const supabase = getSupabase(env);
      const existing = await readStorageConfig(supabase);
      const verified = await verifyConfiguredStorageChannel(env, body?.chat_id);
      if (existing?.active_storage_chat_id &&
          existing.active_storage_chat_id !== verified.chat_id &&
          body?.confirm_change !== true) {
        throw makeError("تغيير قناة التخزين يحتاج إلى تأكيد صريح.", 409, "STORAGE_CHANNEL_CONFIRMATION_REQUIRED");
      }

      const { data, error } = await supabase
        .from("movie_media_storage_config")
        .upsert({
          id: 1,
          active_storage_chat_id: verified.chat_id,
          active_channel_title: verified.title,
          updated_by: auth.userId
        }, { onConflict: "id" })
        .select("id,active_storage_chat_id,active_channel_title,updated_at")
        .single();
      if (error) throw error;

      auditAction = "media.storage_channel.change";
      entityType = "telegram_integration";
      const auditLogged = await auditEvent(env, auth, {
        action: auditAction,
        entityType,
        details: {
          previous_storage_chat_id: existing?.active_storage_chat_id || null,
          active_storage_chat_id: verified.chat_id,
          active_channel_title: verified.title
        }
      });
      return send(helpers, request, { ...data, audit_logged: auditLogged });
    }

    if (resource === "assets" && parts.length === 3 && request.method === "POST" &&
        ["approve", "reject", "deactivate"].includes(action)) {
      const nextStatus = action === "approve" ? "active" : action === "reject" ? "rejected" : "inactive";
      const updated = await updateAssetStatus(env, id, nextStatus);
      auditAction = "media.asset." + action;
      entityId = updated.title_id;
      const auditLogged = await auditEvent(env, auth, {
        action: auditAction,
        entityType: "movie",
        entityId,
        details: { media_asset_id: updated.id, status: updated.status }
      });
      return send(helpers, request, { ...updated, audit_logged: auditLogged });
    }

    if (resource === "titles" && parts.length === 3 && action === "rights" && request.method === "POST") {
      const body = await helpers.readJson(request);
      const updated = await updateDistributionRights(env, id, body, auth);
      auditAction = "media.rights.update";
      entityId = updated.id;
      const auditLogged = await auditEvent(env, auth, {
        action: auditAction,
        entityType: "movie",
        entityId,
        details: { distribution_rights_status: updated.distribution_rights_status }
      });
      return send(helpers, request, { ...updated, audit_logged: auditLogged });
    }

    return helpers.withCors(helpers.failure("NOT_FOUND", "مسار إدارة الوسائط غير موجود.", 404), request);
  } catch (error) {
    if (auth) {
      await recordAdminFailure(env, auth, {
        action: auditAction,
        entityType,
        entityId,
        failureCode: error?.code || "MEDIA_OPERATION_FAILED",
        failureType: error?.name || "Error"
      });
    }
    return sendFailure(helpers, request, error);
  }
}
