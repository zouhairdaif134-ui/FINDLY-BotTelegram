import test from "node:test";
import assert from "node:assert/strict";
import { handleMediaRoute, verifyMovieStorageChannel } from "../src/routes/media.js";

function makeHelpers(permissionResponse) {
  const permissions = [];
  return {
    permissions,
    requirePermission: async (_env, _request, permission) => {
      permissions.push(permission);
      return permissionResponse(permission);
    },
    withCors: (response) => response,
    success: (data) => new Response(JSON.stringify({ success: true, data }), { status: 200 }),
    failure: (code, message, status) => new Response(
      JSON.stringify({ success: false, error: { code, message } }),
      { status }
    ),
    readJson: async (request) => request.json()
  };
}

function request(path, method = "GET", body) {
  return new Request("https://api.example" + path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function url(path) {
  return new URL("https://api.example" + path);
}

test("does not intercept routes outside the Media API", async () => {
  const helpers = makeHelpers(() => ({ response: new Response("Forbidden", { status: 403 }) }));
  const result = await handleMediaRoute({}, request("/api/activity"), url("/api/activity"), helpers);
  assert.equal(result, null);
  assert.deepEqual(helpers.permissions, []);
});

test("requires media.manage before accessing media review endpoints", async () => {
  const helpers = makeHelpers(() => ({ response: new Response("Forbidden", { status: 403 }) }));
  const response = await handleMediaRoute(
    {},
    request("/api/media/assets"),
    url("/api/media/assets"),
    helpers
  );
  assert.equal(response.status, 403);
  assert.deepEqual(helpers.permissions, ["media.manage"]);
});

test("returns 404 for unknown Media API endpoints after permission check", async () => {
  const helpers = makeHelpers(() => ({ userId: "99999999-9999-4999-8999-999999999999" }));
  const response = await handleMediaRoute(
    {},
    request("/api/media/unknown"),
    url("/api/media/unknown"),
    helpers
  );
  assert.equal(response.status, 404);
  assert.deepEqual(helpers.permissions, ["media.manage"]);
});

test("verifies Watch Bot identity, channel type, administrator access and channel_post webhook", async () => {
  const calls = [];
  const result = await verifyMovieStorageChannel({
    chatId: "@findly_media_storage",
    configuredUsername: "@FindlyMovies2026Bot",
    telegram: async (method, payload) => {
      calls.push({ method, payload });
      if (method === "getMe") return { id: 7001, is_bot: true, username: "FindlyMovies2026Bot" };
      if (method === "getChat") return { id: -1001234567890, type: "channel", title: "FINDLY MEDIA STORAGE", username: "findly_media_storage" };
      if (method === "getWebhookInfo") return { url: "https://worker.example/telegram/movies", allowed_updates: ["message", "callback_query", "channel_post"] };
      if (method === "getChatMember") return { status: "administrator" };
      throw new Error("Unexpected Telegram method: " + method);
    }
  });

  assert.deepEqual(result, {
    chat_id: "-1001234567890",
    title: "FINDLY MEDIA STORAGE",
    username: "findly_media_storage",
    bot_username: "FindlyMovies2026Bot",
    bot_status: "administrator",
    webhook_url: "https://worker.example/telegram/movies",
    receives_channel_posts: true
  });
  assert.ok(calls.some((call) => call.method === "getChatMember" && call.payload.user_id === 7001));
});

test("rejects a Telegram token whose identity differs from the configured Watch Bot", async () => {
  await assert.rejects(
    verifyMovieStorageChannel({
      chatId: "-1001234567890",
      configuredUsername: "FindlyMovies2026Bot",
      telegram: async (method) => {
        if (method === "getMe") return { id: 7001, is_bot: true, username: "WrongBot" };
        if (method === "getChat") return { id: -1001234567890, type: "channel", title: "Storage" };
        if (method === "getWebhookInfo") return { url: "https://worker.example/telegram/movies", allowed_updates: ["channel_post"] };
        throw new Error("getChatMember must not run after identity mismatch");
      }
    }),
    (error) => error.status === 409 && error.code === "TELEGRAM_IDENTITY_MISMATCH"
  );
});

test("rejects channels where Watch Bot is not an administrator", async () => {
  await assert.rejects(
    verifyMovieStorageChannel({
      chatId: "-1001234567890",
      configuredUsername: "FindlyMovies2026Bot",
      telegram: async (method) => {
        if (method === "getMe") return { id: 7001, is_bot: true, username: "FindlyMovies2026Bot" };
        if (method === "getChat") return { id: -1001234567890, type: "channel", title: "Storage" };
        if (method === "getWebhookInfo") return { url: "https://worker.example/telegram/movies", allowed_updates: ["channel_post"] };
        if (method === "getChatMember") return { status: "member" };
        throw new Error("Unexpected Telegram method: " + method);
      }
    }),
    (error) => error.status === 409 && error.code === "TELEGRAM_BOT_NOT_CHANNEL_ADMIN"
  );
});

test("rejects a Watch Bot webhook that does not receive channel_post updates", async () => {
  await assert.rejects(
    verifyMovieStorageChannel({
      chatId: "-1001234567890",
      configuredUsername: "FindlyMovies2026Bot",
      telegram: async (method) => {
        if (method === "getMe") return { id: 7001, is_bot: true, username: "FindlyMovies2026Bot" };
        if (method === "getChat") return { id: -1001234567890, type: "channel", title: "Storage" };
        if (method === "getWebhookInfo") return { url: "https://worker.example/telegram/movies", allowed_updates: ["message", "callback_query"] };
        if (method === "getChatMember") return { status: "administrator" };
        throw new Error("Unexpected Telegram method: " + method);
      }
    }),
    (error) => error.status === 409 && error.code === "TELEGRAM_CHANNEL_POST_DISABLED"
  );
});

test("rejects group chats and invalid channel references", async () => {
  await assert.rejects(
    verifyMovieStorageChannel({
      chatId: "-1001234567890",
      configuredUsername: "FindlyMovies2026Bot",
      telegram: async (method) => {
        if (method === "getMe") return { id: 7001, is_bot: true, username: "FindlyMovies2026Bot" };
        if (method === "getChat") return { id: -1001234567890, type: "supergroup", title: "Not a channel" };
        if (method === "getWebhookInfo") return { url: "https://worker.example/telegram/movies", allowed_updates: ["channel_post"] };
        throw new Error("Unexpected Telegram method: " + method);
      }
    }),
    (error) => error.code === "INVALID_STORAGE_CHANNEL"
  );
  await assert.rejects(
    verifyMovieStorageChannel({
      chatId: "https://t.me/findly_media_storage",
      configuredUsername: "FindlyMovies2026Bot",
      telegram: async () => { throw new Error("Telegram must not be called"); }
    }),
    /أدخل معرّف القناة الرقمي/
  );
});

test("rejects unsupported media status filters before querying storage", async () => {
  const helpers = makeHelpers(() => ({ userId: "99999999-9999-4999-8999-999999999999" }));
  const path = "/api/media/assets?status=not-a-status";
  const response = await handleMediaRoute({}, request(path), url(path), helpers);
  assert.equal(response.status, 400);
  assert.deepEqual(helpers.permissions, ["media.manage"]);
});

test("rejects webhook configurations that would disable Watch Bot messages or callbacks", async () => {
  await assert.rejects(
    verifyMovieStorageChannel({
      chatId: "-1001234567890",
      configuredUsername: "FindlyMovies2026Bot",
      telegram: async (method) => {
        if (method === "getMe") return { id: 7001, is_bot: true, username: "FindlyMovies2026Bot" };
        if (method === "getChat") return { id: -1001234567890, type: "channel", title: "Storage" };
        if (method === "getWebhookInfo") return { url: "https://worker.example/telegram/movies", allowed_updates: ["channel_post"] };
        if (method === "getChatMember") return { status: "administrator" };
        throw new Error("Unexpected Telegram method: " + method);
      }
    }),
    (error) => error.status === 409 && error.code === "TELEGRAM_REQUIRED_UPDATES_DISABLED"
  );
});
