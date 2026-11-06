# FINDLY AI Advanced — Implementation Plan

Date: 2026-11-06
Branch: feat/ai-advanced-phase1
Base: main at production merge 58fcd0bc6b4932c6c562fa8b35425c49d8f4936e
Status: Phases 1–5 implemented; privacy-safe AI telemetry added in Phase 6. Latest CI passed; dedicated test-Supabase runtime verification remains blocked. No Production release.

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

## Phase 5 — Discovery quality
Implemented on the feature branch; no user-data actions were added:
1. Added the read-only find_similar_titles tool. It resolves a reference title, gathers shared catalog genres, excludes the reference title, and ranks candidates by genre overlap before applying the candidate cap; rating and release date break ties.
2. Improved conversational intent guidance: broad mood/vibe/preference requests route to recommend_catalog_titles; mood is mapped to a genre only when it matches a real catalog genre. Recent-title requests use newest ordering; other recommendations use top-rated ordering.
3. Named-title detail requests route to search_catalog and use only its approved metadata and bounded overview.
4. Added regression coverage for similarity relevance when a high-overlap result would otherwise fall beyond the candidate cap, plus runtime prompt-contract checks for conversational intent, grounded genre mapping and detailed-title lookup.
5. Existing active-only filtering, per-bot configuration, query/result bounds and maximum three tool calls remain in place.

Acceptance: recommendations and details are grounded in active catalog records; no model-invented catalog facts; no database writes. The latest test run passed 114/114 before the prompt-contract assertions; final CI for the current head is tracked separately.

## Phase 6 — Privacy-safe observability and release readiness
Implemented so far:
1. Successful AI replies emit an ai_message analytics event with response duration only.
2. AI failures emit an ai_error event with a bounded category (timeout, provider_missing, rate_limited, provider_rejected, provider_unavailable, or internal_error).
3. AI telemetry events omit the Telegram user identity and message/update content. Console errors contain only bot slug and the safe category; raw exception messages and provider response bodies are not logged.
4. Added tests for safe classification and non-disclosure of private prompt/error text.

Verification at commit 121a381b5a261b7e8985468afde0e2a15c90924e:
- 115 Node tests passed, 0 failed.
- Dashboard build passed.
- Wrangler Worker dry-run passed.
- Disposable PostgreSQL migration and AI memory RLS verification passed.

Still required before release readiness:
1. Connect Preview to a dedicated test Supabase project and verify authenticated API flows.
2. Run a real Telegram Preview conversation, including AI disabled, missing provider credentials, provider error/rate limit, and ordinary bot fallback. Do not use Production credentials or data.
3. Review dashboard analytics presentation for ai_message and ai_error event counts.
4. Keep PR Draft until the owner explicitly approves the next release step.

The Preview currently lacks a dedicated test Supabase environment, so authenticated API and real Telegram runtime behavior are not claimed as verified.

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
