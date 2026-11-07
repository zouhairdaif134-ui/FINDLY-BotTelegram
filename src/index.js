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
  deleteContent,
  getMoviesCatalog,
  createMovieCatalogItem,
  updateMovieCatalogItem,
  deleteMovieCatalogItem,
  searchTmdbCatalog,
  importTmdbCatalogItem
} from "./routes/content.js";

import {
  getUsers,
  updateUser
} from "./routes/users.js";
import { getAdmins, getAdminRoles, inviteAdmin, updateAdmin } from "./routes/admins.js";

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
import { getAnalytics, getMovieReferralAnalytics } from "./routes/analytics.js";
import { getActivity } from "./routes/activity.js";
import { handleMonetizationRoute } from "./routes/monetization.js";
import { recordAdminEvent } from "./lib/admin-audit.js";
import {
  getSettings,
  createSetting,
  updateSetting,
  deleteSetting
} from "./routes/settings.js";
import { getAIAdminConfig, saveAIAdminConfig } from "./routes/ai.js";

import {
  handleTelegramUpdate
} from "./routes/telegram.js";

import {
  runJobsAutomation
} from "./lib/jobs.js";

import {
  runJobsDelivery
} from "./lib/job-delivery.js";

import {
  setWebhook,
  getWebhookInfo,
  deleteWebhook,
  telegramRequest,
  getTelegramWebhookSecret
} from "./lib/telegram.js";

import { authorizeRequest } from "./lib/auth.js";
import { getSupabase } from "./lib/supabase.js";
import { cleanupExpiredAISessionMessages } from "./lib/ai-memory.js";
import { activateDueMonetizationCampaigns } from "./lib/monetization.js";
import { renderMovieSharePage } from "./lib/movie-sharing.js";
import {
  listMovieQueue,
  enqueueMovieQueue,
  retryMovieQueueItem,
  resolveMovieQueueItem,
  rejectMovieQueueItem,
  processMovieQueueHourly,
  markMovieQueuePublished
} from "./lib/movie-queue.js";

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

  adminsManage:
    "admins.manage",

  favorites:
    "users.view",

  notifications:
    "notifications.manage",

  analytics:
    "analytics.view",

  settings:
    "settings.manage"
};

function corsHeaders(request) {
  const origin = request?.headers.get("Origin") || "";
  const isAllowedPreviewOrigin =
    /^https:\/\/(?:feat-findly-movies-runtime-h|feat-ai-advanced-phase1|feat-hourly-movie-queue|feat-cloudflare-workers-ai|[a-f0-9]{8})\.findly-bottelegram\.pages\.dev$/.test(origin);
  const isAllowedOrigin =
    origin === "https://findly-bottelegram.pages.dev" ||
    isAllowedPreviewOrigin;
  const headers = {
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-FINDLY-JOBS-SECRET",
    "Access-Control-Allow-Methods":
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Vary": "Origin"
  };

  if (isAllowedOrigin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function withCors(response, request) {
  const headers =
    new Headers(response.headers);

  Object.entries(
    corsHeaders(request)
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

async function getTelegramIdentityStatus(env, botSlug) {
  const supabase = getSupabase(env);
  const { data: bot, error } = await supabase
    .from("bots")
    .select("slug, telegram_username")
    .eq("slug", botSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!bot) {
    const missing = new Error("Active bot record was not found");
    missing.code = "PGRST116";
    throw missing;
  }
  const identity = await telegramRequest(env, botSlug, "getMe");
  const configured = String(bot.telegram_username || "").replace(/^@/, "").toLowerCase();
  const actual = String(identity?.username || "").toLowerCase();
  return {
    configured_username: bot.telegram_username || null,
    identity: {
      id: identity?.id || null,
      is_bot: Boolean(identity?.is_bot),
      first_name: identity?.first_name || null,
      username: identity?.username || null
    },
    matches_configured_username: Boolean(configured && actual && configured === actual)
  };
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
  async scheduled(controller, env) {
    const startedAt = new Date().toISOString();

    console.log("FINDLY scheduled invocation started:", {
      cron: controller?.cron || null,
      started_at: startedAt
    });

    try {
      await cleanupExpiredAISessionMessages(getSupabase(env));
    } catch (error) {
      console.error("FINDLY AI session-memory expiry cleanup failed:", {
        code: error?.code || null,
        message: error?.message || "Unknown error"
      });
    }

    try {
      const queueResult = await processMovieQueueHourly(env);
      if (queueResult?.processed) {
        console.log("FINDLY hourly movie queue processed:", queueResult);
      }
    } catch (error) {
      console.error("FINDLY hourly movie queue failed:", {
        code: error?.code || null,
        message: error?.message || "Unknown error"
      });
    }

    let monetization = null;
    try {
      monetization = await activateDueMonetizationCampaigns(env);
    } catch (error) {
      console.error("FINDLY monetization schedule activation failed:", {
        code: error?.code || null,
        message: error?.message || "Unknown error"
      });
    }

    try {
      const result = await runJobsAutomation(env);

      console.log("FINDLY scheduled jobs sync finished:", {
        finished_at: new Date().toISOString(),
        sync: result
      });

      let delivery = null;

      try {
        delivery = await runJobsDelivery(env);
      } catch (error) {
        console.error("FINDLY jobs delivery skipped until delivery migration is active:", {
          message: error?.message || "Unknown error"
        });
      }

      console.log("FINDLY scheduled invocation completed:", {
        completed_at: new Date().toISOString(),
        delivery,
        monetization
      });
    } catch (error) {
      console.error("FINDLY scheduled invocation failed:", {
        cron: controller?.cron || null,
        started_at: startedAt,
        message: error?.message || "Unknown error"
      });
      throw error;
    }
  },

  async fetch(
    request,
    env,
    ctx
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
        , request);
      }

      /*
       * PUBLIC MOVIE SHARE PAGES
       * These routes are intentionally public so Facebook's crawler can read
       * Open Graph metadata without an authenticated dashboard session.
       */
      const movieShareMatch = url.pathname.match(/^\/share\/movie\/([0-9a-f-]{36})(?:\/(poster))?$/i);
      if (movieShareMatch && request.method === "GET") {
        const movieId = movieShareMatch[1];
        const isPoster = movieShareMatch[2] === "poster";
        const { data: movie, error: movieError } = await getSupabase(env)
          .from("movie_titles")
          .select("id,media_type,title,overview,release_year,runtime_minutes,rating,poster_path,status")
          .eq("id", movieId)
          .eq("status", "active")
          .maybeSingle();

        if (movieError) throw movieError;
        if (!movie) {
          return new Response("Movie not found", {
            status: 404,
            headers: { "Cache-Control": "no-store" }
          });
        }

        if (isPoster) {
          let posterUrl;
          try {
            posterUrl = new URL(String(movie.poster_path || ""));
          } catch {
            return new Response("Poster not found", { status: 404 });
          }
          if (
            posterUrl.protocol !== "https:" ||
            posterUrl.hostname !== "image.tmdb.org" ||
            !posterUrl.pathname.startsWith("/t/p/")
          ) {
            return new Response("Poster not found", { status: 404 });
          }
          const posterResponse = await fetch(posterUrl.toString(), {
            headers: { Accept: "image/jpeg,image/png,image/webp" }
          });
          const contentType = posterResponse.headers.get("content-type") || "";
          if (!posterResponse.ok || !contentType.startsWith("image/")) {
            return new Response("Poster unavailable", { status: 502 });
          }
          return withCors(new Response(posterResponse.body, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=86400",
              "X-Content-Type-Options": "nosniff"
            }
          }), request);
        }

        const requestedSource = url.searchParams.get("source");
        const source = ["facebook", "instagram"].includes(requestedSource)
          ? requestedSource
          : "facebook";
        const { data: bot, error: botError } = await getSupabase(env)
          .from("bots")
          .select("telegram_username")
          .eq("slug", "movies")
          .eq("is_active", true)
          .maybeSingle();
        if (botError) throw botError;
        if (!bot?.telegram_username) {
          return new Response("FINDLY Movies bot is unavailable", { status: 503 });
        }
        const { data: genreLinks, error: genreError } = await getSupabase(env)
          .from("movie_title_genres")
          .select("movie_genres(name)")
          .eq("title_id", movie.id);
        if (genreError) throw genreError;
        movie.genres = (genreLinks || []).map((link) => link.movie_genres?.name).filter(Boolean);

        const html = renderMovieSharePage(movie, bot.telegram_username, source, url.origin);
        return new Response(html, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=300, s-maxage=3600",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "strict-origin-when-cross-origin"
          }
        });
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
        , request);
      }

      /*
       * =========================
       * JOBS AUTOMATION MANUAL RUN
       * =========================
       *
       * Protected operational endpoint.
       * Uses the existing Telegram webhook secret as the
       * shared operational secret; no new secret is required.
       *
       * POST /api/jobs/sync
       * Header: X-FINDLY-JOBS-SECRET
       */

      if (
        url.pathname === "/api/jobs/sync" &&
        request.method === "POST"
      ) {
        if (!env.TELEGRAM_WEBHOOK_SECRET) {
          return withCors(
            failure(
              "JOBS_CONFIG_ERROR",
              "Operational secret is missing",
              500
            )
          , request);
        }

        const receivedSecret = request.headers.get(
          "X-FINDLY-JOBS-SECRET"
        );

        if (receivedSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
          return withCors(
            failure(
              "UNAUTHORIZED",
              "Invalid jobs operational secret",
              401
            )
          , request);
        }

        const sync = await runJobsAutomation(env);

        return withCors(
          success({
            sync
          })
        , request);
      }

      /*
       * =========================
       * JOBS CLICK TRACKING
       * =========================
       *
       * Public redirect used by Telegram job-detail buttons.
       * The destination is resolved from the database to prevent
       * arbitrary open redirects.
       */
      if (
        url.pathname.startsWith("/jobs/click/") &&
        request.method === "GET"
      ) {
        const jobId = decodeURIComponent(
          url.pathname.slice("/jobs/click/".length)
        );

        const uuidPattern =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        if (!uuidPattern.test(jobId)) {
          return new Response("Job not found", { status: 404 });
        }

        const supabase = getSupabase(env);
        const { data: job, error } = await supabase
          .from("jobs")
          .select("id, title, source_url")
          .eq("id", jobId)
          .eq("status", "active")
          .maybeSingle();

        if (error) throw error;
        if (!job?.source_url) {
          return new Response("Job not found", { status: 404 });
        }

        const { data: bot } = await supabase
          .from("bots")
          .select("id")
          .eq("bot_type", "master")
          .eq("is_active", true)
          .maybeSingle();

        const { error: analyticsError } = await supabase
          .from("analytics_events")
          .insert({
            user_id: null,
            bot_id: bot?.id || null,
            event_type: "job_offer_clicked",
            event_data: {
              job_id: job.id,
              title: job.title,
              source_url: job.source_url
            }
          });

        if (analyticsError) {
          console.error("Job click analytics failed:", analyticsError);
        }

        return Response.redirect(job.source_url, 302);
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
          , request);
        }

        let expectedSecret;
        try {
          expectedSecret = getTelegramWebhookSecret(env, botSlug);
        } catch {
          return withCors(
            failure(
              "TELEGRAM_CONFIG_ERROR",
              "Telegram webhook secret is missing",
              500
            )
          , request);
        }

        const receivedSecret =
          request.headers.get(
            "X-Telegram-Bot-Api-Secret-Token"
          );

        if (
          receivedSecret !== expectedSecret
        ) {
          return withCors(
            failure(
              "UNAUTHORIZED",
              "Invalid Telegram webhook secret",
              401
            )
          , request);
        }

        const update =
          await readJson(
            request
          );

        console.log("Telegram webhook received:", {
          botSlug,
          update_id: update?.update_id ?? null
        });

        let processingError = null;
        const processUpdate =
          handleTelegramUpdate(
            env,
            botSlug,
            update
          ).catch((error) => {
            processingError = error;
            console.error(
              "Telegram webhook processing failed:",
              {
                botSlug,
                update_id: update?.update_id ?? null,
                message: error?.message || "Unknown error"
              }
            );
          });

        // The Master bot's AI response is user-facing work, not background
        // analytics. Await it so Cloudflare's 30-second waitUntil window
        // cannot cancel a slow answer after Telegram has already received 200.
        // Other bots keep their existing ack-first background processing.
        if (botSlug === "findly") {
          await processUpdate;
          if (processingError) {
            return withCors(
              failure(
                "TELEGRAM_PROCESSING_ERROR",
                "Telegram update processing failed",
                500
              ),
              request
            );
          }
        } else if (ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(processUpdate);
        } else {
          await processUpdate;
        }

        return withCors(
          success({
            ok: true
          })
        , request);
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
          , request);
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

        const identityStatus = await getTelegramIdentityStatus(env, botSlug);
        if (!identityStatus.matches_configured_username) {
          return withCors(failure(
            "TELEGRAM_IDENTITY_MISMATCH",
            "The Telegram token identity does not match the bot username configured in FINDLY.",
            409
          ), request);
        }

        const webhookUrl =
          `${url.origin}/telegram/${botSlug}`;

        const result =
          await setWebhook(
            env,
            botSlug,
            webhookUrl
          );

        await recordAdminEvent(env, auth, {
          action: "telegram.webhook.connect",
          entityType: "telegram_integration",
          entityId: null,
          details: { bot_slug: botSlug }
        });

        return withCors(
          success({
            bot:
              botSlug,
            webhook:
              webhookUrl,
            result
          })
        , request);
      }

      /*
       * =========================
       * TELEGRAM WEBHOOK INFO
       * =========================
       *
       * Protected admin diagnostic endpoint.
       *
       * GET
       * /api/telegram/webhook/:slug
       */

      if (
        url.pathname.startsWith(
          "/api/telegram/webhook/"
        ) &&
        request.method ===
          "GET"
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
          , request);
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

        const identityStatus = await getTelegramIdentityStatus(env, botSlug);
        const result =
          await getWebhookInfo(
            env,
            botSlug
          );

        return withCors(
          success({
            bot: botSlug,
            identity: identityStatus,
            webhook: result
          })
        , request);
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
          , request);
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

        await recordAdminEvent(env, auth, {
          action: "telegram.webhook.disconnect",
          entityType: "telegram_integration",
          entityId: null,
          details: { bot_slug: botSlug }
        });

        return withCors(
          success({
            bot:
              botSlug,
            result
          })
        , request);
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
          , request);
        }

        const data =
          await createBot(env, await readJson(request), auth);

        return withCors(
          success(data)
        , request);
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
          , request);
        }

        const data =
          await updateBot(env, getId(url), await readJson(request), auth);

        return withCors(
          success(data)
        , request);
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
          , request);
        }

        const data =
          await deleteBot(env, getId(url), auth);

        return withCors(
          success(data)
        , request);
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
          , request);
        }

        return withCors(
          success(
            await getBots(
              env
            )
          )
        , request);
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
          , request);
        }

        return withCors(
          success(
            await getCategories(
              env
            )
          )
        , request);
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
          , request);
        }

        return withCors(
          success(
            await createCategory(env, await readJson(request), auth)
          )
        , request);
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
          , request);
        }

        return withCors(
          success(
            await updateCategory(env, getId(url), await readJson(request), auth)
          )
        , request);
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
          , request);
        }

        return withCors(
          success(
            await deleteCategory(env, getId(url), auth)
          )
        , request);
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
          , request);
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
        , request);
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
          , request);
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
        , request);
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
          , request);
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
        , request);
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
          , request);
        }

        return withCors(
          success(
            await deleteMenu(
              env,
              getId(url)
            )
          )
        , request);
      }

      /*
       * =========================
       * MOVIES CATALOG
       * =========================
       * Protected by existing FINDLY content permissions.
       */

      if (url.pathname === "/api/movies/queue" && request.method === "GET") {
        const auth = await requirePermission(env, request, PERMISSIONS.contentView);
        if (auth.response) return withCors(auth.response, request);
        return withCors(success(await listMovieQueue(env, url.searchParams.get("status"))), request);
      }

      if (url.pathname === "/api/movies/queue" && request.method === "POST") {
        const auth = await requirePermission(env, request, PERMISSIONS.contentCreate);
        if (auth.response) return withCors(auth.response, request);
        return withCors(success(await enqueueMovieQueue(env, await readJson(request), auth)), request);
      }

      const movieQueueAction = url.pathname.match(/^\/api\/movies\/queue\/([0-9a-f-]{36})\/(retry|resolve|reject)$/i);
      if (movieQueueAction && request.method === "POST") {
        const action = movieQueueAction[2];
        const permission = ["retry", "reject"].includes(action) ? PERMISSIONS.contentUpdate : PERMISSIONS.contentCreate;
        const auth = await requirePermission(env, request, permission);
        if (auth.response) return withCors(auth.response, request);
        const itemId = movieQueueAction[1];
        if (action === "retry") return withCors(success(await retryMovieQueueItem(env, itemId)), request);
        if (action === "reject") return withCors(success(await rejectMovieQueueItem(env, itemId)), request);
        return withCors(success(await resolveMovieQueueItem(env, itemId, await readJson(request), auth)), request);
      }

      if (url.pathname === "/api/movies/tmdb/search" && request.method === "GET") {
        const auth = await requirePermission(env, request, PERMISSIONS.contentView);
        if (auth.response) return withCors(auth.response, request);
        const results = await searchTmdbCatalog(env, url.searchParams.get("query"), url.searchParams.get("media_type") || "movie", url.searchParams.get("page") || 1);
        return withCors(success(results), request);
      }

      if (url.pathname === "/api/movies/tmdb/import" && request.method === "POST") {
        const auth = await requirePermission(env, request, PERMISSIONS.contentCreate);
        if (auth.response) return withCors(auth.response, request);
        const body = await readJson(request);
        const result = await importTmdbCatalogItem(env, body.tmdb_id, body.media_type || "movie", auth);
        return withCors(success(result), request);
      }

      if (url.pathname === "/api/movies" && request.method === "GET") {
        const auth = await requirePermission(env, request, PERMISSIONS.contentView);
        if (auth.response) return withCors(auth.response, request);
        return withCors(success(await getMoviesCatalog(env, url.searchParams.get("status"))), request);
      }

      if (url.pathname === "/api/movies" && request.method === "POST") {
        const auth = await requirePermission(env, request, PERMISSIONS.contentCreate);
        if (auth.response) return withCors(auth.response, request);
        return withCors(success(await createMovieCatalogItem(env, await readJson(request), auth)), request);
      }

      if (url.pathname.startsWith("/api/movies/") && request.method === "PUT") {
        const auth = await requirePermission(env, request, PERMISSIONS.contentUpdate);
        if (auth.response) return withCors(auth.response, request);
        const movieUpdateBody = await readJson(request);
        const updatedMovie = await updateMovieCatalogItem(env, getId(url), movieUpdateBody, auth);
        if (movieUpdateBody.status === "active") {
          await markMovieQueuePublished(env, getId(url));
        }
        return withCors(success(updatedMovie), request);
      }

      if (url.pathname.startsWith("/api/movies/") && request.method === "DELETE") {
        const auth = await requirePermission(env, request, PERMISSIONS.contentDelete);
        if (auth.response) return withCors(auth.response, request);
        return withCors(success(await deleteMovieCatalogItem(env, getId(url), auth)), request);
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
          , request);
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
        , request);
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
          , request);
        }

        return withCors(
          success(
            await createContent(env, await readJson(request), auth)
          )
        , request);
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
          , request);
        }

        return withCors(
          success(
            await updateContent(env, getId(url), await readJson(request), auth)
          )
        , request);
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
          , request);
        }

        return withCors(
          success(
            await deleteContent(env, getId(url), auth)
          )
        , request);
      }

      /*
       * =========================
       * ADMINISTRATORS
       * =========================
       */
      if (url.pathname === "/api/admins/roles" && request.method === "GET") {
        const auth = await requirePermission(env, request, PERMISSIONS.adminsManage);
        if (auth.response) return withCors(auth.response, request);
        return withCors(success(await getAdminRoles(env)), request);
      }

      if (url.pathname === "/api/admins" && request.method === "GET") {
        const auth = await requirePermission(env, request, PERMISSIONS.adminsManage);
        if (auth.response) return withCors(auth.response, request);
        return withCors(success(await getAdmins(env)), request);
      }

      if (url.pathname === "/api/admins/invite" && request.method === "POST") {
        const auth = await requirePermission(env, request, PERMISSIONS.adminsManage);
        if (auth.response) return withCors(auth.response, request);
        return withCors(success(await inviteAdmin(env, await readJson(request), auth)), request);
      }

      if (url.pathname.startsWith("/api/admins/") && request.method === "PUT") {
        const auth = await requirePermission(env, request, PERMISSIONS.adminsManage);
        if (auth.response) return withCors(auth.response, request);
        return withCors(success(await updateAdmin(env, getId(url), await readJson(request), auth)), request);
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
          , request);
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
        , request);
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
          , request);
        }

        return withCors(
          success(
            await updateUser(env, getId(url), await readJson(request), auth)
          )
        , request);
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
          , request);
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
        , request);
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
          , request);
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
        , request);
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
          , request);
        }

        return withCors(
          success(
            await deleteFavorite(
              env,
              getId(url)
            )
          )
        , request);
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
          , request);
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
        , request);
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
          , request);
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
        , request);
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
          , request);
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
        , request);
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
          , request);
        }

        return withCors(
          success(
            await deleteNotification(
              env,
              getId(url)
            )
          )
        , request);
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
          , request);
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
        , request);
      }

      if (
        url.pathname ===
          "/api/analytics/movie-referrals" &&
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
          , request);
        }

        return withCors(
          success(
            await getMovieReferralAnalytics(env)
          )
        , request);
      }

      if (
        url.pathname === "/api/ai/config" &&
        request.method === "GET"
      ) {
        const auth = await requirePermission(env, request, PERMISSIONS.settings);
        if (auth.response) return withCors(auth.response, request);
        return withCors(success(await getAIAdminConfig(
          env,
          url.searchParams.get("bot_id")
        )), request);
      }

      if (
        url.pathname === "/api/ai/config" &&
        request.method === "PUT"
      ) {
        const auth = await requirePermission(env, request, PERMISSIONS.settings);
        if (auth.response) return withCors(auth.response, request);
        return withCors(success(await saveAIAdminConfig(
          env,
          await readJson(request),
          auth
        )), request);
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
          , request);
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
        , request);
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
          , request);
        }

        return withCors(
          success(
            await createSetting(env, await readJson(request), auth)
          )
        , request);
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
          , request);
        }

        return withCors(
          success(
            await updateSetting(env, getId(url), await readJson(request), auth)
          )
        , request);
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
          , request);
        }

        return withCors(
          success(
            await deleteSetting(env, getId(url), auth)
          )
        , request);
      }

      const monetizationResponse = await handleMonetizationRoute(env, request, url, {
        requirePermission,
        readJson,
        withCors,
        success,
        failure
      });
      if (monetizationResponse) return monetizationResponse;

      if (url.pathname === "/api/activity" && request.method === "GET") {
        const auth = await requirePermission(env, request, "activity.view");
        if (auth.response) return withCors(auth.response, request);
        return withCors(success(await getActivity(env, url)), request);
      }

      if (url.pathname.match(/^\/api\/movies\/[0-9a-f-]{36}\/share$/i) && request.method === "POST") {
        const auth = await requirePermission(env, request, PERMISSIONS.contentView);
        if (auth.response) return withCors(auth.response, request);
        const movieId = getId(url);
        const body = await readJson(request);
        const platform = body?.platform;
        if (!["facebook", "instagram"].includes(platform)) {
          return withCors(failure("BAD_REQUEST", "platform must be facebook or instagram", 400), request);
        }
        await recordAdminEvent(env, auth, {
          action: "movie.share." + platform,
          entityType: "movie",
          entityId: movieId,
          details: { platform }
        });
        return withCors(success({ recorded: true }), request);
      }

      return withCors(
        failure(
          "NOT_FOUND",
          "Endpoint not found",
          404
        )
      , request);
    } catch (error) {
      console.error("FINDLY_API_ERROR", {
        name: error?.name || "Error",
        message: error?.message || String(error),
        code: error?.code || null,
        details: error?.details || null,
        hint: error?.hint || null,
        status: error?.status || null,
        path: url?.pathname || null
      });

      if (error?.code === "TELEGRAM_CONFIG_ERROR") {
        return withCors(
          failure(
            "TELEGRAM_CONFIG_ERROR",
            error.message,
            500
          )
        , request);
      }

      if (error?.code === "TELEGRAM_API_ERROR") {
        return withCors(
          failure(
            "TELEGRAM_API_ERROR",
            error.message,
            502
          )
        , request);
      }

      if (error?.code === "PGRST116") {
        return withCors(
          failure(
            "NOT_FOUND",
            "Resource not found",
            404
          )
        , request);
      }

      if (error?.code === "23505") {
        return withCors(
          failure(
            "CONFLICT",
            "Resource already exists",
            409
          )
        , request);
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
        , request);
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
        , request);
      }

      return withCors(
        failure(
          "API_ERROR",
          "Internal server error",
          500
        )
      , request);
    }
  }
};
