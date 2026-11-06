# FINDLY AI Advanced — Implementation Plan

Date: 2026-11-06
Branch: feat/ai-advanced-phase1
Base: main at production merge 58fcd0bc6b4932c6c562fa8b35425c49d8f4936e
Status: Approved plan; implementation staged

## Repository facts verified
- Worker backend: src/index.js
- Existing provider runtime: src/lib/ai.js
- Existing bot settings CRUD: src/routes/settings.js (RBAC-protected in router)
- Telegram fallback integration: src/routes/telegram.js
- Dashboard: dashboard/src/App.jsx; AI section currently uses ComingSoonSection.
- Tests: node:test via npm test; dashboard build via dashboard/package.json.
- Movie catalog: movie_titles, movie_genres, movie_title_genres.
- Identity risk: Telegram runtime resolves telegram_users.id; movie_favorites references auth.users(id). Do not connect AI mutations until a secure mapping is verified.

## Phase 0 — Branch and baseline
1. Work only on feat/ai-advanced-phase1.
2. Read the full route dispatch, Telegram update/callback flow, settings RBAC, bot_settings schema and migration history.
3. Run baseline npm test and dashboard npm run build in an executable checkout/CI.
4. Record existing failures before changing code.

Acceptance: branch isolated; baseline results recorded; no production changes.

## Phase 1 — AI Core (first implementation slice)
1. Add focused tests for config normalization, disabled-by-default behavior, per-bot overrides, safe defaults, invalid settings, output limits, provider errors and missing credentials.
2. Observe failing tests before implementation.
3. Extend src/lib/ai.js with a pure validated configuration resolver and injectable provider boundary where practical.
4. Resolve bot-specific config first, then global defaults, then safe built-in defaults.
5. Keep provider credentials in Cloudflare secrets; never persist or return keys.
6. Add request timeout/abort, input/output bounds, safe provider error logging, and provider response validation.
7. Avoid unbounded arbitrary endpoint fetching; validate HTTPS and reject localhost/private/link-local destinations or use an explicit provider endpoint allowlist.
8. Keep AI disabled unless explicitly enabled for that bot.
9. Add usage counters only if an existing safe analytics/storage contract is identified; otherwise defer persistence rather than invent schema.

Acceptance: tests prove config precedence, no key leakage, bounded requests, disabled behavior and safe failure; existing Telegram commands remain unaffected.

## Phase 2 — AI API and Dashboard
1. Define dedicated read/update AI endpoints using existing auth and settings.manage or a narrowly scoped permission.
2. Never return secret values; expose configured/not-configured status only.
3. Replace AI Coming Soon UI with Overview and Configuration first.
4. Verify CORS, RBAC, validation, and dashboard production build.

Acceptance: unauthorized access denied; dashboard cannot read provider secrets; per-bot config round-trips safely.

## Phase 3 — Hybrid Memory
1. Inspect current telegram_users/user_bots relationships; use the internal telegram_users.id and bot_id scope only.
2. Add service-role-only memory tables with RLS, a 30-minute session expiry, bounded history and explicit consent timestamps.
3. Implement private-chat-only session context, persistent consent buttons, explicit preference-save confirmation, status/list, clear, off and on commands.
4. Purge expired session messages through the existing five-minute scheduled Worker invocation.
5. Add unit and migration-contract tests. Do not apply the migration to Production; validate CI and a dedicated Preview database before rollout.

Acceptance: no persistent preference before consent and per-item confirmation; group chats cannot read/write personal memory; one user/bot scope cannot access another; denial clears persistent preferences; off deletes data and stops session writes; expiry cleanup removes old session rows.

## Phase 4 — Catalog knowledge and recommendations
1. Implement typed read-only search tools against active movie_titles and genres.
2. Return only catalog-backed metadata.
3. Add relevance and empty-result tests; keep SQL access outside model control.

Acceptance: model cannot fabricate catalog facts; tools only return active records.

### Phase 4 implementation notes
- Added fixed OpenAI-compatible function tools: `search_catalog` and `recommend_catalog_titles`.
- Both tools query only `movie_titles.status = active`; all SQL and Supabase access remain in trusted Worker code.
- Search supports title/original-title matching, exact-title relevance ranking, optional media-type filtering, and a maximum of five results.
- Recommendations support optional genre/media-type filters and either top-rated or newest ordering, with bounded genre relation reads.
- Tool responses include only catalog-backed title, year/date, rating, runtime, overview and genres. Long plot summaries, provider URLs, external IDs, draft/inactive titles and media delivery fields are not exposed.
- AI receives the tools only when a trusted server-side Supabase handle is supplied. At most three tool calls are executed per turn; unknown tools and malformed arguments fail safely.
- The follow-up model request is instructed to use returned catalog records only and to disclose when the catalog has no match.
- No schema migration is required for this phase.

Acceptance review:
- Search/recommendation tests cover active-only filtering, bounded queries/results, empty results, exact-title relevance and safe database failures.
- Runtime tests cover fixed tool exposure, tool-call execution, grounded tool-result handoff, no database handle, and unknown tool rejection.
- CI verification is pending for the latest branch head.

## Phase 5 — Confirmed user actions
1. Resolve telegram_users to auth.users securely before favorites integration.
2. Create short-lived pending actions bound to user, bot and payload.
3. Implement confirm/cancel callbacks with expiry, replay protection and ownership checks.
4. Add audit logging without sensitive prompt or credential data.

Acceptance: no mutation without valid explicit confirmation; forged, replayed, expired and cross-user callbacks fail.

## Phase 6 — Dashboard observability and release
1. Add usage/error metrics and privacy-safe logs.
2. Test provider failure, rate limits, quota exhaustion and fallback behavior.
3. Run full backend tests, dashboard build, migration tests and security review.
4. Deploy Preview only; obtain owner approval before Production merge/deploy.

## Explicit exclusions
- No automatic paid provider activation or paid plan.
- No production database migration, deployment, or main-branch merge without approval.
- No arbitrary SQL/tool execution by the model.
- No persistent memory without opt-in.
- No claim of actual provider cost when only an estimate is available.
