import test from "node:test";
import assert from "node:assert/strict";
import { buildTelegramUserProfile } from "../src/lib/telegram-user.js";

test("preserves Telegram is_bot so known bots cannot inflate MAU", () => {
  const profile = buildTelegramUserProfile({
    id: 123456789,
    username: "sample_bot",
    first_name: "Sample",
    is_bot: true,
    language_code: "en"
  });
  assert.equal(profile.telegram_user_id, "123456789");
  assert.equal(profile.is_bot, true);
});

test("marks ordinary Telegram users as non-bots and normalizes optional fields", () => {
  const profile = buildTelegramUserProfile({
    id: 987654321,
    first_name: "User",
    is_bot: false
  });
  assert.equal(profile.is_bot, false);
  assert.equal(profile.username, null);
  assert.equal(profile.last_name, null);
  assert.equal(profile.language_code, null);
});

test("rejects updates without a Telegram user ID", () => {
  assert.equal(buildTelegramUserProfile({ first_name: "Missing" }), null);
});
