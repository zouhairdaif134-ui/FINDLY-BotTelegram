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
1. Inspect current telegram_users/user_bots relationships and all identity mapping.
2. Design additive tables with RLS, strict user/bot scoping, expiry and consent timestamps.
3. Implement opt-in, opt-out, list, delete and session expiry.
4. Add migration tests and isolation tests before applying any database migration.

Acceptance: no persistent preference before consent; one user cannot read/delete another user's memory; revocation stops future writes.

## Phase 4 — Catalog knowledge and recommendations
1. Implement typed read-only search tools against active movie_titles and genres.
2. Return only catalog-backed metadata.
3. Add relevance and empty-result tests; keep SQL access outside model control.

Acceptance: model cannot fabricate catalog facts; tools only return active records.

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
