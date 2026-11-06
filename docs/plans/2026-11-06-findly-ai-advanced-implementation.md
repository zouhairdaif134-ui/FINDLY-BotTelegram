# FINDLY AI Advanced — Implementation Plan

Date: 2026-11-06
Branch: feat/ai-advanced-phase1
Base: main at production merge 58fcd0bc6b4932c6c562fa8b35425c49d8f4936e
Status: Phases 1–4 implemented; CI passed; Pages Preview deployed. No Production release.

## Repository facts verified
- Worker backend: src/index.js
- Existing provider runtime: src/lib/ai.js
- Existing bot settings CRUD: src/routes/settings.js (RBAC-protected in router)
- Telegram fallback integration: src/routes/telegram.js
- Dashboard: dashboard/src/App.jsx
- Tests: node:test via npm test; dashboard build via dashboard/package.json.
- Movie catalog: movie_titles, movie_genres, movie_title_genres.
- Identity risk: Telegram runtime resolves telegram_users.id; movie_favorites references auth.users(id). This mismatch is not in scope because AI will not mutate user data.

## Phase 0 — Branch and baseline
Completed on the feature branch. Work remains isolated; no Production changes.

## Phase 1 — AI Core
Implemented and covered by tests:
- AI disabled by default; per-bot settings with safe global defaults.
- Bounded inputs/outputs, timeout, provider response validation and safe errors.
- API keys are Cloudflare secrets only; never persisted or returned.
- HTTPS provider URL validation and explicit host allowlisting.

## Phase 2 — AI API and Dashboard
Implemented:
- RBAC-protected GET/PUT /api/ai/config using settings.manage.
- Secret values are never returned; only configured/not-configured status is exposed.
- Dashboard AI configuration UI is implemented.
- Dashboard build passed in CI.

## Phase 3 — Hybrid Memory
Implemented with migration and verification tests:
- Memory scoped by internal telegram_users.id and bots.id.
- Private-chat-only session context; latest 12 messages with 30-minute expiry.
- Persistent preferences require explicit consent and per-item confirmation.
- /memory, /memory add, /memory clear, /memory off and /memory on.
- RLS enabled; service-role-only access; cleanup uses the existing scheduled Worker.
- No Production migration has been applied.

## Phase 4 — Catalog knowledge and recommendations
Implemented:
- Fixed read-only tools: search_catalog and recommend_catalog_titles.
- Active/published catalog records only; no arbitrary SQL or model-generated SQL.
- Bounded results and tool calls; catalog facts are grounded in returned records.
- No catalog writes and no user-data mutations.

## Current verification evidence
At commit 2522b9597980eaafa895a7a608ab4619325d9a52:
- GitHub Actions: FINDLY Movies and Worker Tests — completed/success.
- GitHub Actions: FINDLY tests — completed/success.
- Recorded suite result: 111 tests passed, 0 failed.
- Worker dry-run and dashboard build passed in the recorded CI run.
- Disposable PostgreSQL migration/RLS verification passed.
- Cloudflare Pages Preview deployment bb3098b8-ac83-44dc-bb33-010a0b385d9b completed successfully.
- Preview URL: https://bb3098b8.findly-bottelegram.pages.dev
- Preview page was fetched and returned the FINDLY ADMIN sign-in screen.
- Authenticated API round-trip and live Telegram interaction are not yet verified; Preview is not connected to a dedicated test Supabase environment.
- No Production deployment, live migration, AI activation, or provider secret setup has occurred.

## Phase 5 — Discovery quality (next for user-facing AI)
Do not add user-data actions. Improve only read-only discovery:
1. Add a grounded similar-title discovery path using catalog genres, media type, year and rating.
2. Improve natural-language intent mapping for conversational search (e.g. mood, genre, era, language only where catalog fields support it).
3. Add a detailed-title response path that exposes only approved catalog fields and a bounded overview.
4. Add tests for relevance, missing metadata, empty results, and explicit disclosure when the catalog cannot answer.
5. Preserve active-only filtering, per-bot isolation, query bounds and tool-call limits.

Acceptance: all suggestions and details are grounded in active catalog records; no model-invented titles or metadata; no database writes.

## Phase 6 — Privacy-safe observability and release readiness
1. Add only necessary usage/error counters and redact prompts, personal data, credentials and provider response bodies.
2. Test disabled AI, missing credentials, provider failures, rate limits and quota exhaustion with ordinary bot fallback intact.
3. Verify Preview API flows against a dedicated test Supabase project before any live integration.
4. Re-run backend tests, dashboard build, migration/RLS checks and security review.
5. Keep PR Draft until the owner explicitly approves the next release step.

## Separate future track — Admin AI (after the user-facing work is finished)
Build a distinct, admin-only assistant inside the control center. It must not share user-facing permissions or memory.
Initial scope:
- Movie Content Assistant: research title metadata from approved sources, prepare expanded summaries, short Telegram descriptions, translations and genre/category suggestions.
- Library QA: detect duplicates, missing fields and inconsistent metadata.
- Telegram operations helper: summarize bot health/errors and suggest fixes.
- Admin reports: summarize catalog and bot activity where trustworthy metrics exist.
Safety:
- Admin AI drafts and recommends; it does not publish, alter catalog records, change bot configuration or execute operational actions without a separate explicit admin approval.
- Source provenance must be visible; uncertain facts must be marked for review.
- No new paid provider or external service without approval.
- Start this track only after Phases 5–6 are complete and verified.

## Explicit exclusions
- No AI actions to add favorites, create watchlists, or otherwise mutate user data.
- No automatic paid provider activation or paid plan.
- No Production database migration, deployment, or main-branch merge without explicit approval.
- No arbitrary SQL/tool execution by the model.
- No persistent memory without opt-in.
- No claim of actual provider cost when only an estimate is available.
