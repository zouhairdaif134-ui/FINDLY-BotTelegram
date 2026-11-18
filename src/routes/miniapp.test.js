import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { validateTelegramInitData, parseCatalogPagination, truncateOverview } from "./miniapp.js";

async function signedInitData(token, user, authDate, startParam = "") {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AAE-test-query",
    user: JSON.stringify(user)
  });
  if (startParam) params.set("start_param", startParam);
  const data = Array.from(params.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => k + "=" + v).join("\n");
  const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const secret = await webcrypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  const signKey = await webcrypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await webcrypto.subtle.sign("HMAC", signKey, new TextEncoder().encode(data));
  const hash = Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
  params.set("hash", hash);
  return params.toString();
}

test("validates a Telegram Mini App initData signature and user", async () => {
  const token = "123456:TEST_TOKEN";
  const now = 1794650000000;
  const raw = await signedInitData(token, { id: 987654321, first_name: "Test" }, Math.floor(now / 1000));
  const result = await validateTelegramInitData(raw, token, now, webcrypto);
  assert.equal(result.user.id, 987654321);
});

test("preserves Telegram's signed Mini App start_param", async () => {
  const token = "123456:TEST_TOKEN";
  const now = 1794650000000;
  const startParam = "movie_550e8400-e29b-41d4-a716-446655440000_fc_a1b2c3d4e5f60718293a4b5c";
  const raw = await signedInitData(token, { id: 987654321 }, Math.floor(now / 1000), startParam);
  const result = await validateTelegramInitData(raw, token, now, webcrypto);
  assert.equal(result.startParam, startParam);
});

test("rejects tampered, expired and bot-user initData", async () => {
  const token = "123456:TEST_TOKEN";
  const now = 1794650000000;
  const fresh = await signedInitData(token, { id: 987654321 }, Math.floor(now / 1000));
  assert.equal(await validateTelegramInitData(fresh + "x", token, now, webcrypto), null);
  const expired = await signedInitData(token, { id: 987654321 }, Math.floor(now / 1000) - 90000);
  assert.equal(await validateTelegramInitData(expired, token, now, webcrypto), null);
  const bot = await signedInitData(token, { id: 987654321, is_bot: true }, Math.floor(now / 1000));
  assert.equal(await validateTelegramInitData(bot, token, now, webcrypto), null);
});


test("catalog pagination clamps page size and rejects negative offsets", () => {
  assert.deepEqual(parseCatalogPagination({ limit: 500, offset: -20 }), { limit: 50, offset: 0 });
  assert.deepEqual(parseCatalogPagination({ limit: 20, offset: 80 }), { limit: 20, offset: 80 });
  assert.deepEqual(parseCatalogPagination({}), { limit: 40, offset: 0 });
});

test("catalog overview is shortened without changing short text", () => {
  assert.equal(truncateOverview("A short synopsis"), "A short synopsis");
  const result = truncateOverview("word ".repeat(60), 160);
  assert.equal(result.length <= 160, true);
  assert.equal(result.endsWith("…"), true);
});
