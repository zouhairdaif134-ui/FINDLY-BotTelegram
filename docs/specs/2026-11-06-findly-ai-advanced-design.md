# FINDLY AI Advanced — Design Specification v1.0

Date: 2026-11-06
Status: Approved by product owner
Target: FINDLY Telegram bots and Admin Dashboard

## Product decisions
- One shared AI orchestration runtime; user data and conversational context are isolated per Telegram user and per bot.
- Hybrid memory: short-lived session context plus persistent user preferences only after explicit Telegram opt-in.
- User-facing mutations require a clear preview and explicit confirmation. AI never receives unrestricted database write access.
- AI remains disabled by default. Existing bot commands and catalog browsing continue to work when AI is disabled, unavailable, or over quota.
- Prefer free tiers and existing infrastructure. No paid provider, subscription, or production deployment is activated automatically.

## Architecture
Telegram update -> bot-specific AI configuration -> AI orchestrator -> allowlisted read tools / pending confirmed actions -> Telegram response.
The dashboard manages configuration and observability through authenticated, permission-checked API routes.

### Configuration
- Per-bot configuration with global defaults.
- Provider-compatible model and HTTPS endpoint, system prompt, temperature and output-token cap.
- Provider credentials are Cloudflare secrets, never dashboard/database plaintext.
- Safe defaults, strict validation, rate limits, per-user and per-bot quotas.
- No automatic provider failover that could incur cost.

### Memory and privacy
- Session memory stores at most the latest 12 user/assistant messages per Telegram user and bot, each expiring after 30 minutes; scheduled cleanup runs with the existing five-minute Worker cron.
- Session memory is used only in private Telegram chats. Group chats never read or write personal memory.
- The first successful AI response explains temporary context and asks separately for persistent-memory opt-in.
- Persistent preference storage is disabled until the user selects the explicit consent button.
- A user preference is saved only after `/memory add <text>` and a second confirmation button. Maximum 20 preferences, 300 characters each.
- `/memory` displays status and saved preferences; `/memory clear` requests confirmation before deletion; `/memory off` clears data and disables session storage; `/memory on` re-enables temporary context and asks for persistent consent when needed.
- Denial clears persistent preferences; revocation prevents future session writes until re-enabled.
- Memory is keyed by `telegram_users.id` plus `bots.id`; Telegram numeric IDs and Supabase Auth IDs are not substituted for the internal identity.
- Memory tables have RLS enabled and are accessible only through the trusted Worker service role.
- Do not store credentials, payment data, or sensitive personal information. Users are warned not to send secrets to the assistant.

### Knowledge and tools
- Catalog search and recommendations use published FINDLY movie/series records and genre relations.
- Model output must not invent title metadata, ratings, availability or links.
- Tools expose narrow typed operations, not arbitrary SQL or general database access.

### Confirmed actions
- The model may propose supported actions only.
- Server creates a short-lived, user-bound pending action.
- Telegram callback confirmation revalidates user, bot, action, expiry and payload before executing.
- Cancellation, expiry, replay protection and audit events are required.
- Favorites integration must first resolve the identity mismatch between Telegram users and auth.users used by movie_favorites.

### Dashboard
- Overview, bot configuration, provider/model settings, memory policy, tools, logs and usage.
- API routes require existing RBAC permissions; secrets are never returned to clients.
- Usage and cost are estimates based on provider-reported usage where available; never label estimates as settled billing.

## Delivery and safety
- Develop on feat/ai-advanced-phase1; do not merge to main or deploy Production without explicit approval.
- Each phase uses tests-first development and verified CI/build evidence.
- Database migrations are additive, reviewed, and tested for RLS and isolation before any production application.
- First delivery slice is AI Core configuration and safe provider invocation. Memory, tools, actions and dashboard are subsequent slices.
