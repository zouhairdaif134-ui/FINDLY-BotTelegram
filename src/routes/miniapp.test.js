import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { validateTelegramInitData } from "./miniapp.js";

async function signedInitData(token, user, authDate) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AAE-test-query",
    user: JSON.stringify(user)
  });
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
