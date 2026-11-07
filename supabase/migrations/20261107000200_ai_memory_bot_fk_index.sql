-- Cover the bot_id foreign key for efficient bot deletes/updates.
-- The existing (user_id, bot_id, created_at) index remains optimal for per-user history reads.
create index if not exists ai_user_session_messages_bot_idx
  on public.ai_user_session_messages (bot_id);
