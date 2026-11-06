export function buildTelegramUserProfile(telegramUser) {
  if (!telegramUser?.id) return null;
  return {
    telegram_user_id: String(telegramUser.id),
    username: telegramUser.username || null,
    first_name: telegramUser.first_name || null,
    last_name: telegramUser.last_name || null,
    language_code: telegramUser.language_code || null,
    is_bot: telegramUser.is_bot === true
  };
}
