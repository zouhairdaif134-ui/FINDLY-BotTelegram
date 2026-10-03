import {
  getBots,
  createBot,
  updateBot,
  deleteBot
} from "./routes/bots.js";

import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
} from "./routes/categories.js";

import {
  getMenus,
  createMenu,
  updateMenu,
  deleteMenu
} from "./routes/menus.js";

import {
  getContent,
  createContent,
  updateContent,
  deleteContent
} from "./routes/content.js";

import {
  getUsers,
  updateUser
} from "./routes/users.js";

import {
  getFavorites,
  createFavorite,
  deleteFavorite
} from "./routes/favorites.js";
import {
  getNotifications,
  createNotification,
  updateNotification,
  deleteNotification
} from "./routes/notifications.js";
import { getAnalytics } from "./routes/analytics.js";
import {
  getSettings,
  createSetting,
  updateSetting,
  deleteSetting
} from "./routes/settings.js";

import {
  handleTelegramUpdate
} from "./routes/telegram.js";

import {
  setWebhook,
  deleteWebhook
} from "./lib/telegram.js";

import { authorizeRequest } from "./lib/auth.js";

import {
  success,
  failure
} from "./lib/response.js";

const PERMISSIONS = {
  botsView: "bots.view",

  categoriesView:
    "categories.view",
  categoriesCreate:
    "categories.create",
  categoriesUpdate:
    "categories.update",
  categoriesDelete:
    "categories.delete",

  menusView:
    "menus.view",
  menusManage:
    "menus.manage",

  contentView:
    "content.view",
  contentCreate:
    "content.create",
  contentUpdate:
    "content.update",
  contentDelete:
    "content.delete",

  usersView:
    "users.view",
  usersManage:
    "users.manage",

  favorites:
    "users.view",

  notifications:
    "notifications.manage",

  analytics:
    "analytics.view",

  settings:
    "settings.manage"
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "https://findly-bottelegram.pages.dev",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type",
    "Access-Control-Allow-Methods":
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  };
}

function withCors(response) {
  const headers =
    new Headers(response.headers);

  Object.entries(
    corsHeaders()
  ).forEach(
    ([key, value]) => {
      headers.set(
        key,
        value
      );
    }
  );

  return new Response(
    response.body,
    {
      status:
        response.status,
      statusText:
        response.statusText,
      headers
    }
  );
}

async function requirePermission(
  env,
  request,
  permission
) {
  return authorizeRequest(
    env,
    request,
    permission
  );
}

async function readJson(
  request
) {
  try {
    return await request.json();
  } catch {
    throw new Error(
      "Request body must contain valid JSON"
    );
  }
}

function getId(url) {
  const parts =
    url.pathname
      .split("/")
      .filter(Boolean);

  return parts[2] || null;
}

function getTelegramSlug(
  url
) {
  const parts =
    url.pathname
      .split("/")
      .filter(Boolean);

  return parts[1] || null;
}

export default {
  async fetch(
    request,
    env
  ) {
    const url =
      new URL(
        request.url
      );

    try {
      if (
        request.method ===
        "OPTIONS"
      ) {
        return withCors(
          new Response(
            null,
            {
              status: 204
            }
          )
        );
      }

      /*
       * =========================
       * HEALTH
       * =========================
       */

      if (
        url.pathname ===
          "/health" &&
        request.method ===
          "GET"
      ) {
        return withCors(
          success({
            service:
              "findly-v3-api",
            version:
              "3.1.0",
            status:
              "healthy"
          })
        );
      }

      /*
       * =========================
       * TELEGRAM WEBHOOKS
       * =========================
       */

      if (
        url.pathname.startsWith(
          "/telegram/"
        ) &&
        request.method ===
          "POST"
      ) {
        if (
          !env.TELEGRAM_WEBHOOK_SECRET
        ) {
          return withCors(
            failure(
              "TELEGRAM_CONFIG_ERROR",
              "Telegram webhook secret is missing",
              500
            )
          );
        }

        const receivedSecret =
          request.headers.get(
            "X-Telegram-Bot-Api-Secret-Token"
          );

        if (
          receivedSecret !==
          env.TELEGRAM_WEBHOOK_SECRET
        ) {
          return withCors(
            failure(
              "UNAUTHORIZED",
              "Invalid Telegram webhook secret",
              401
            )
          );
        }

        const botSlug =
          getTelegramSlug(
            url
          );

        if (!botSlug) {
          return withCors(
            failure(
              "BAD_REQUEST",
              "Telegram bot slug is required",
              400
            )
          );
        }

        const update =
          await readJson(
            request
          );

        await handleTelegramUpdate(
          env,
          botSlug,
          update
        );

        return withCors(
          success({
            ok: true
          })
        );
      }

      /*
       * =========================
       * TELEGRAM WEBHOOK SETUP
       * =========================
       *
       * Protected admin endpoint.
       *
       * POST
       * /api/telegram/webhook/:slug
       */

      if (
        url.pathname.startsWith(
          "/api/telegram/webhook/"
        ) &&
        request.method ===
          "POST"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            "settings.manage"
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        if (
          !env.TELEGRAM_WEBHOOK_SECRET
        ) {
          throw new Error(
            "TELEGRAM_WEBHOOK_SECRET is missing"
          );
        }

        const parts =
          url.pathname
            .split("/")
            .filter(Boolean);

        const botSlug =
          parts[3] || null;

        if (!botSlug) {
          throw new Error(
            "Bot slug is required"
          );
        }

        const webhookUrl =
          `${url.origin}/telegram/${botSlug}`;

        const result =
          await setWebhook(
            env,
            botSlug,
            webhookUrl
          );

        return withCors(
          success({
            bot:
              botSlug,
            webhook:
              webhookUrl,
            result
          })
        );
      }

      /*
       * =========================
       * TELEGRAM WEBHOOK DELETE
       * =========================
       *
       * Protected admin endpoint.
       *
       * DELETE
       * /api/telegram/webhook/:slug
       */

      if (
        url.pathname.startsWith(
          "/api/telegram/webhook/"
        ) &&
        request.method ===
          "DELETE"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            "settings.manage"
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        const parts =
          url.pathname
            .split("/")
            .filter(Boolean);

        const botSlug =
          parts[3] || null;

        if (!botSlug) {
          throw new Error(
            "Bot slug is required"
          );
        }

        const result =
          await deleteWebhook(
            env,
            botSlug
          );

        return withCors(
          success({
            bot:
              botSlug,
            result
          })
        );
      }

      /*
       * =========================
       * BOTS
       * =========================
       */

      if (
        url.pathname ===
          "/api/bots" &&
        request.method ===
          "POST"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            "bots.create"
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        const data =
          await createBot(
            env,
            await readJson(
              request
            )
          );

        return withCors(
          success(data)
        );
      }

      if (
        url.pathname.startsWith(
          "/api/bots/"
        ) &&
        request.method ===
          "PUT"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            "bots.update"
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        const data =
          await updateBot(
            env,
            getId(url),
            await readJson(
              request
            )
          );

        return withCors(
          success(data)
        );
      }

      if (
        url.pathname.startsWith(
          "/api/bots/"
        ) &&
        request.method ===
          "DELETE"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            "bots.delete"
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        const data =
          await deleteBot(
            env,
            getId(url)
          );

        return withCors(
          success(data)
        );
      }

      if (
        url.pathname ===
          "/api/bots" &&
        request.method ===
          "GET"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.botsView
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await getBots(
              env
            )
          )
        );
      }

      /*
       * =========================
       * CATEGORIES
       * =========================
       */

      if (
        url.pathname ===
          "/api/categories" &&
        request.method ===
          "GET"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.categoriesView
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await getCategories(
              env
            )
          )
        );
      }

      if (
        url.pathname ===
          "/api/categories" &&
        request.method ===
          "POST"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.categoriesCreate
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await createCategory(
              env,
              await readJson(
                request
              )
            )
          )
        );
      }

      if (
        url.pathname.startsWith(
          "/api/categories/"
        ) &&
        request.method ===
          "PUT"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.categoriesUpdate
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await updateCategory(
              env,
              getId(url),
              await readJson(
                request
              )
            )
          )
        );
      }

      if (
        url.pathname.startsWith(
          "/api/categories/"
        ) &&
        request.method ===
          "DELETE"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.categoriesDelete
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await deleteCategory(
              env,
              getId(url)
            )
          )
        );
      }

      /*
       * =========================
       * MENUS
       * =========================
       */

      if (
        url.pathname ===
          "/api/menus" &&
        request.method ===
          "GET"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.menusView
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await getMenus(
              env,
              url.searchParams.get(
                "bot"
              )
            )
          )
        );
      }

      if (
        url.pathname ===
          "/api/menus" &&
        request.method ===
          "POST"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.menusManage
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await createMenu(
              env,
              await readJson(
                request
              )
            )
          )
        );
      }

      if (
        url.pathname.startsWith(
          "/api/menus/"
        ) &&
        request.method ===
          "PUT"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.menusManage
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await updateMenu(
              env,
              getId(url),
              await readJson(
                request
              )
            )
          )
        );
      }

      if (
        url.pathname.startsWith(
          "/api/menus/"
        ) &&
        request.method ===
          "DELETE"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.menusManage
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await deleteMenu(
              env,
              getId(url)
            )
          )
        );
      }

      /*
       * =========================
       * CONTENT
       * =========================
       */

      if (
        url.pathname ===
          "/api/content" &&
        request.method ===
          "GET"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.contentView
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await getContent(
              env,
              url.searchParams.get(
                "bot"
              ),
              url.searchParams.get(
                "category"
              )
            )
          )
        );
      }

      if (
        url.pathname ===
          "/api/content" &&
        request.method ===
          "POST"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.contentCreate
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await createContent(
              env,
              await readJson(
                request
              )
            )
          )
        );
      }

      if (
        url.pathname.startsWith(
          "/api/content/"
        ) &&
        request.method ===
          "PUT"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.contentUpdate
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await updateContent(
              env,
              getId(url),
              await readJson(
                request
              )
            )
          )
        );
      }

      if (
        url.pathname.startsWith(
          "/api/content/"
        ) &&
        request.method ===
          "DELETE"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.contentDelete
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await deleteContent(
              env,
              getId(url)
            )
          )
        );
      }

      /*
       * =========================
       * USERS
       * =========================
       */

      if (
        url.pathname ===
          "/api/users" &&
        request.method ===
          "GET"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.usersView
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await getUsers(
              env,
              url.searchParams.get(
                "bot_id"
              )
            )
          )
        );
      }

      if (
        url.pathname.startsWith(
          "/api/users/"
        ) &&
        request.method ===
          "PUT"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.usersManage
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await updateUser(
              env,
              getId(url),
              await readJson(
                request
              )
            )
          )
        );
      }

      /*
       * =========================
       * EXISTING MODULES
       * =========================
       */

      if (
        url.pathname ===
          "/api/favorites" &&
        request.method ===
          "GET"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.favorites
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await getFavorites(
              env,
              url.searchParams.get(
                "user_id"
              )
            )
          )
        );
      }

      if (
        url.pathname ===
          "/api/favorites" &&
        request.method ===
          "POST"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.favorites
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await createFavorite(
              env,
              await readJson(
                request
              )
            )
          )
        );
      }

      if (
        url.pathname.startsWith(
          "/api/favorites/"
        ) &&
        request.method ===
          "DELETE"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.favorites
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await deleteFavorite(
              env,
              getId(url)
            )
          )
        );
      }

      if (
        url.pathname ===
          "/api/notifications" &&
        request.method ===
          "GET"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.notifications
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await getNotifications(
              env,
              url.searchParams.get(
                "user_id"
              ),
              url.searchParams.get(
                "bot_id"
              )
            )
          )
        );
      }

      if (
        url.pathname ===
          "/api/notifications" &&
        request.method ===
          "POST"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.notifications
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await createNotification(
              env,
              await readJson(
                request
              )
            )
          )
        );
      }

      if (
        url.pathname.startsWith(
          "/api/notifications/"
        ) &&
        request.method ===
          "PUT"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.notifications
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await updateNotification(
              env,
              getId(url),
              await readJson(
                request
              )
            )
          )
        );
      }

      if (
        url.pathname.startsWith(
          "/api/notifications/"
        ) &&
        request.method ===
          "DELETE"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.notifications
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await deleteNotification(
              env,
              getId(url)
            )
          )
        );
      }

      if (
        url.pathname ===
          "/api/analytics" &&
        request.method ===
          "GET"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.analytics
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await getAnalytics(
              env,
              url.searchParams.get(
                "user_id"
              ),
              url.searchParams.get(
                "bot_id"
              ),
              url.searchParams.get(
                "event_type"
              )
            )
          )
        );
      }

      if (
        url.pathname ===
          "/api/settings" &&
        request.method ===
          "GET"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.settings
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await getSettings(
              env,
              url.searchParams.get(
                "bot_id"
              )
            )
          )
        );
      }

      if (
        url.pathname ===
          "/api/settings" &&
        request.method ===
          "POST"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.settings
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await createSetting(
              env,
              await readJson(
                request
              )
            )
          )
        );
      }

      if (
        url.pathname.startsWith(
          "/api/settings/"
        ) &&
        request.method ===
          "PUT"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.settings
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await updateSetting(
              env,
              getId(url),
              await readJson(
                request
              )
            )
          )
        );
      }

      if (
        url.pathname.startsWith(
          "/api/settings/"
        ) &&
        request.method ===
          "DELETE"
      ) {
        const auth =
          await requirePermission(
            env,
            request,
            PERMISSIONS.settings
          );

        if (auth.response) {
          return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await deleteSetting(
              env,
              getId(url)
            )
          )
        );
      }

      return withCors(
            auth.response
          );
        }

        return withCors(
          success(
            await getSettings(
              env,
              url.searchParams.get(
                "bot_id"
              )
            )
          )
        );
      }

      return withCors(
        failure(
          "NOT_FOUND",
          "Endpoint not found",
          404
        )
      );
    } catch (error) {
      console.error(
        error
      );

      if (error?.code === "PGRST116") {
        return withCors(
          failure(
            "NOT_FOUND",
            "Resource not found",
            404
          )
        );
      }

      if (error?.code === "23505") {
        return withCors(
          failure(
            "CONFLICT",
            "Resource already exists",
            409
          )
        );
      }

      const validationErrors = new Set([
        "Request body must contain valid JSON",
        "name, slug and bot_type are required",
        "Bot id is required",
        "No fields to update",
        "Category name is required",
        "Category slug is required",
        "Category id is required",
        "Category name cannot be empty",
        "Category slug cannot be empty",
        "bot_id is required",
        "Menu label is required",
        "Menu id is required",
        "Menu label cannot be empty",
        "Content title is required",
        "Content id is required",
        "Content title cannot be empty",
        "User id is required",
        "No supported fields to update",
        "Bot slug is required",
        "user_id, bot_id and subscription_type are required",
        "Notification id is required",
        "subscription_type cannot be empty",
        "No supported notification fields to update",
        "user_id and content_id are required",
        "Favorite id is required",
        "bot_id and setting_key are required",
        "setting_key cannot be empty",
        "Setting id is required",
        "No supported setting fields to update"
      ]);

      if (validationErrors.has(error?.message)) {
        return withCors(
          failure(
            "BAD_REQUEST",
            "Invalid request",
            400
          )
        );
      }

      if (
        error?.status &&
        Number.isInteger(error.status) &&
        error.status >= 400 &&
        error.status < 500
      ) {
        return withCors(
          failure(
            "BAD_REQUEST",
            "Request could not be processed",
            error.status
          )
        );
      }

      return withCors(
        failure(
          "API_ERROR",
          "Internal server error",
          500
        )
      );
    }
  }
};
