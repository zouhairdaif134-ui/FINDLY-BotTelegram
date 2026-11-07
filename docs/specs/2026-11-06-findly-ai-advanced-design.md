# FINDLY AI Advanced — Design Specification v1.1

Date: 2026-11-06
Status: Product direction approved
Target: FINDLY Telegram bots and Admin Dashboard

## Product decisions
- User-facing FINDLY AI is a search and discovery assistant only.
- Supported user functions: movie/series search, detailed catalog-backed information, smart recommendations, conversational search and similar-title discovery.
- AI must not add favorites, create watchlists, or mutate any user data through chat.
- One shared AI orchestration runtime may serve the bots, but user context and configuration remain isolated per Telegram user and per bot.
- AI remains disabled by default. Existing bot commands and catalog browsing continue to work when AI is disabled, unavailable, or over quota.
- Prefer free tiers and existing infrastructure. No paid provider, subscription, or Production deployment is activated automatically.

## User-facing architecture
Telegram update -> bot-specific AI configuration -> read-only AI orchestrator -> allowlisted catalog search/recommendation tools -> Telegram response.

### Configuration
- Per-bot configuration with global defaults.
- Provider-compatible model and HTTPS endpoint, system prompt, temperature and output-token cap.
- Provider credentials are Cloudflare secrets, never dashboard/database plaintext.
- Safe defaults, strict validation, rate limits, per-user and per-bot quotas.
- No automatic provider failover that could incur cost.

### Memory and privacy
- Session memory stores at most the latest 12 user/assistant messages per Telegram user and bot, each expiring after 30 minutes; scheduled cleanup runs with the existing five-minute Worker cron.
- Session memory is used only in private Telegram chats. Group chats never read or write personal memory.
- Persistent preference storage is disabled until the user selects the explicit consent button.
- A user preference is saved only after /memory add <text> and a second confirmation button. Maximum 20 preferences, 300 characters each.
- /memory displays status and saved preferences; /memory clear requests confirmation before deletion; /memory off clears data and disables session storage; /memory on re-enables temporary context and asks for persistent consent when needed.
- Memory is keyed by telegram_users.id plus bots.id; Telegram numeric IDs and Supabase Auth IDs are not substituted for the internal identity.
- Memory tables have RLS enabled and are accessible only through the trusted Worker service role.
- Do not store credentials, payment data, or sensitive personal information. Users are warned not to send secrets to the assistant.

### Knowledge and tools
- Catalog search, recommendations and similar-title discovery use active/published FINDLY movie/series records and approved genre relations.
- Tool operations are narrow, typed and read-only. The model cannot issue SQL or access arbitrary database fields.
- Model output must not invent title metadata, ratings, availability, plot details or links.
- When the catalog lacks the requested fact, AI must say so clearly rather than guess.
- Conversational intent extraction may only filter on fields actually present and verified in the catalog.

## Separate Admin AI track
Admin AI is a separate, admin-only assistant in the control center and is scheduled only after the user-facing discovery work is complete and verified.

Initial proposed capabilities:
- Movie Content Assistant: prepare expanded summaries, short Telegram descriptions, translations and category/genre suggestions from approved sources.
- Library QA: detect duplicates, missing fields and inconsistent metadata.
- Telegram operations helper: summarize bot health/errors and suggest fixes.
- Admin reports: summarize catalog and bot activity when trustworthy metrics exist.

Admin AI safety:
- Separate admin authorization, tools, context and logs from user-facing AI.
- Draft and recommend by default. Do not publish content, alter catalog records, change bot settings or execute operational actions without explicit admin approval.
- Show source provenance and flag uncertain information for review.
- No new paid provider or external service without approval.

## Dashboard
- Existing AI configuration is RBAC-protected; settings.manage is reused.
- Secrets are never returned to clients.
- Future user-facing observability must redact prompts and personal data.
- Admin AI will have a distinct interface and permission boundary; it must not be exposed to ordinary Telegram users.

## Delivery and safety
- Develop on feat/ai-advanced-phase1; do not merge to main or deploy Production without explicit approval.
- Each phase uses tests-first development and verified CI/build evidence.
- Database migrations are additive, reviewed, and tested for RLS and isolation before any Production application.
- Preview must use a dedicated test Supabase environment before authenticated API or Telegram runtime claims are made.

## Explicit exclusions
- No favorites/watchlist actions or other user-data mutations through AI.
- No arbitrary SQL or unrestricted database access.
- No paid provider activation or Production deployment without approval.
- No persistent memory without opt-in.
