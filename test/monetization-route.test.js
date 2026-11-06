import test from "node:test";
import assert from "node:assert/strict";
import { handleMonetizationRoute } from "../src/routes/monetization.js";

function makeHelpers(permissionResponse) {
  const permissions = [];
  const helpers = {
    permissions,
    requirePermission: async (_env, _request, permission) => {
      permissions.push(permission);
      return { response: permissionResponse(permission) };
    },
    withCors: (response) => response,
    success: (data) => new Response(JSON.stringify(data), { status: 200 }),
    failure: (code, message, status) => new Response(
      JSON.stringify({ code, message }),
      { status, headers: { "Content-Type": "application/json" } }
    ),
    readJson: async (request) => request.json()
  };
  return helpers;
}

function request(path, method = "GET") {
  return new Request("https://api.example" + path, { method });
}

test("does not intercept routes outside the Monetization API", async () => {
  const helpers = makeHelpers(() => new Response("Forbidden", { status: 403 }));
  const result = await handleMonetizationRoute(
    {},
    request("/api/activity"),
    new URL("https://api.example/api/activity"),
    helpers
  );
  assert.equal(result, null);
  assert.deepEqual(helpers.permissions, []);
});

test("rejects unauthenticated Monetization overview requests", async () => {
  const helpers = makeHelpers(() => new Response("Unauthorized", { status: 401 }));
  const response = await handleMonetizationRoute(
    {},
    request("/api/monetization/overview"),
    new URL("https://api.example/api/monetization/overview"),
    helpers
  );
  assert.equal(response.status, 401);
  assert.deepEqual(helpers.permissions, ["monetization.view"]);
});

test("enforces separate granular permissions for Monetization mutations and reports", async () => {
  const cases = [
    ["/api/monetization/providers", "GET", "monetization.view"],
    ["/api/monetization/providers", "POST", "monetization.providers.manage"],
    ["/api/monetization/provider-zones/7f0a2b4d-9d1a-4f6a-9b5a-3a4e5f6b7c8d/verify", "POST", "monetization.providers.verify"],
    ["/api/monetization/placements", "POST", "monetization.placements.manage"],
    ["/api/monetization/frequency-policies", "POST", "monetization.placements.manage"],
    ["/api/monetization/campaigns", "POST", "monetization.campaigns.manage"],
    ["/api/monetization/transactions", "GET", "monetization.transactions.view"],
    ["/api/monetization/transactions", "POST", "monetization.transactions.manage"],
    ["/api/monetization/exclusions", "POST", "monetization.users.manage"]
  ];

  for (const [path, method, expectedPermission] of cases) {
    const helpers = makeHelpers(() => new Response("Forbidden", { status: 403 }));
    const response = await handleMonetizationRoute(
      {},
      request(path, method),
      new URL("https://api.example" + path),
      helpers
    );
    assert.equal(response.status, 403, path);
    assert.deepEqual(helpers.permissions, [expectedPermission], path);
  }
});

test("returns 404 for unknown Monetization endpoints", async () => {
  const helpers = makeHelpers(() => new Response("Forbidden", { status: 403 }));
  const path = "/api/monetization/not-a-real-module";
  const response = await handleMonetizationRoute(
    {},
    request(path),
    new URL("https://api.example" + path),
    helpers
  );
  assert.equal(response.status, 404);
  assert.deepEqual(helpers.permissions, []);
});

test("rejects unsupported public website page keys without requiring dashboard auth", async () => {
  const helpers = makeHelpers(() => new Response("Forbidden", { status: 403 }));
  const path = "/api/monetization/public/placements?page=all_interactions";
  const response = await handleMonetizationRoute(
    {},
    request(path),
    new URL("https://api.example" + path),
    helpers
  );
  assert.equal(response.status, 400);
  assert.deepEqual(helpers.permissions, []);
});
