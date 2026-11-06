# FINDLY Monetization Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Deliver Phase 1 monetization controls for website placements and Telegram ad campaigns, with reliable MAU gating, reporting, auditability and safe OFF-by-default behavior.

**Architecture:** Extend the existing Cloudflare Worker API and Supabase schema; keep privileged writes server-side behind the existing Supabase-authenticated admin permission model. Build a dedicated React dashboard area and a safe website placement runtime contract; integrate Telegram delivery at explicit bot interaction points without blocking movie responses. Premium checkout and paid direct-advertiser onboarding remain locked until 1,000 rolling 30-day MAU and separate Owner approval.

**Tech Stack:** Cloudflare Workers (JavaScript ES modules), Supabase/PostgreSQL/RLS, React 19 + Vite, Telegram Bot API, Node.js built-in test runner.

## Global Constraints

- Work on a dedicated feature branch; do not edit main directly.
- All monetization features default OFF. No live ad tags, broadcasts, payment collection, provider secrets or production setting changes during development.
- Phase 1 is advertising only. Premium subscriptions and paid direct-advertiser onboarding remain reserved/locked until at least 1,000 eligible MAU and separate Owner approval.
- MAU means unique eligible Telegram users with a qualifying interaction in the rolling 30-day window; exclude admin/test accounts and known bots. Confirm interaction/timestamp semantics before finalizing the query.
- Website and Telegram are independently configurable. Telegram ads are FINDLY-managed Bot API messages/cards; website ad-network JavaScript tags are never sent as Telegram message content.
- Telegram formats: standalone text and image/card with title, description and CTA URL.
- Website formats: Banner, Native, Pop-up and Video; only expose a format as available when provider integration is verified. Pop-up OFF by default; Video capability-gated.
- Multiple placements per page are allowed, but each provider zone/script initializes only once per intended placement.
- Never accept arbitrary executable HTML/JavaScript from dashboard input. Provider scripts use controlled, allowlisted integration templates and server-side configuration.
- No unsolicited mass Telegram broadcast. Ads are inserted only at approved interaction points; failed delivery must not break normal bot behavior.
- Distinguish FINDLY delivery metrics from provider-reported revenue. Never infer revenue from impressions/clicks.
- Admin API requires authenticated identity, active admin profile and explicit role permission. Manager rights are only those granted; Owner retains full control.
- Record administrative mutations in the append-only Activity Log. Do not log secrets, tokens, raw provider payloads or unnecessary personal data.
- Additive migrations only; verify production migration state before any production migration. No production deployment until preview, regression, security and rollback checks pass.

---

### Task 1: Database foundation and domain services

**Files**
- Create: supabase/migrations/<new_timestamp>_monetization_controls.sql
- Create: src/lib/monetization.js
- Create: test/monetization-migration.test.js
- Create: test/monetization-service.test.js
- Add SQL assertions under supabase/tests/ where applicable.
- Existing foundation: supabase/migrations/20261003000200_monetization_foundation.sql

**Interfaces**
- getMonetizationOverview(env, filters)
- listAdProviders(env), saveAdProvider(env, input, actor)
- listAdPlacements(env, filters), saveAdPlacement(env, input, actor)
- listAdCampaigns(env, filters), saveAdCampaign(env, input, actor)
- setCampaignStatus(env, campaignId, status, actor)
- listRevenueEvents(env, filters), createRevenueAdjustment(env, input, actor)
- Reuse compatible ad_providers, ad_campaigns, monetization_events and bots tables; add provider zones, placements, channel frequency policy and delivery events only where missing.

- [ ] Add failing tests for foreign keys, unique provider-zone/placement identity, valid channel/format/status values, UTC schedules, numeric money, RLS, service-role-only writes, delivery idempotency and append-only financial corrections. Service tests cover unknown references, invalid transitions, negative amounts, invalid currency/URL and duplicate event keys.
- [ ] Run npm test. Expected: new tests fail because the new service/schema behavior is absent; existing tests remain the baseline.
- [ ] Inspect actual deployed schema and migration history, then reconcile the foundation without duplicate sources of truth. Add constraints, indexes, RLS and service-role-only writes. Use decimal/numeric for money. Implement safe before/after audit snapshots and reversal entries rather than destructive edits to reconciled revenue. Verify how last_seen_at is updated and identify reliable admin/test/known-bot exclusions before using it for MAU.
- [ ] Run npm test. Expected: focused tests pass and existing monetization foundation remains compatible.
- [ ] Run npm test plus the repository's configured disposable Supabase migration/security checks. Expected: anonymous/unauthorized roles cannot access admin monetization data; service_role can perform intended operations.
- [ ] Commit the passing task: feat: add monetization data foundation.

### Task 2: Protected API, granular permissions and MAU

**Files**
- Create: src/routes/monetization.js
- Modify: src/index.js
- Modify: src/lib/auth.js only if a permission helper extension is needed; preserve current authorization semantics.
- Create: test/monetization-route.test.js

**Interfaces**
- GET /api/monetization/overview
- GET|POST /api/monetization/providers; PUT /api/monetization/providers/:id
- GET|POST /api/monetization/placements; PUT /api/monetization/placements/:id
- GET|POST /api/monetization/campaigns; PUT /api/monetization/campaigns/:id; POST /api/monetization/campaigns/:id/status
- GET /api/monetization/transactions; POST /api/monetization/transactions/adjustments
- GET /api/monetization/compatibility
- Use the existing admin_profiles/admin_roles/role_permissions/permissions authorization model. Add granular permission codes and grant Owner access following the current role migration pattern; Manager access only when explicitly granted.

- [ ] Add failing tests for missing/invalid token (401), non-admin and missing permission (403), Owner access, Manager without grant, malformed JSON, invalid IDs, invalid transitions, unsupported format/provider pairs and response secret-redaction.
- [ ] Run npm test. Expected: new route tests fail because the routes/permissions are not registered.
- [ ] Implement route dispatch using existing src/index.js conventions, authorizeRequest, getSupabase and success/failure helpers. Calculate unique eligible MAU over rolling 30 days from confirmed qualifying activity, excluding admin/test/known-bot identities. If reliable exclusion markers do not exist, add an explicit exclusion mechanism rather than guessing. Return the metric definition alongside the number. Integrate successful mutations with recordAdminMutation/recordAdminEvent.
- [ ] Run npm test. Expected: authorization, MAU boundaries (exactly 30 days, just outside, duplicate user, excluded identities) and redaction tests pass.
- [ ] Run npm test. Expected: existing routes, admin permissions and Activity Log tests remain green; every management route rejects anonymous access.
- [ ] Commit the passing task: feat: add protected monetization api.

### Task 3: Dashboard workspace and Placement Manager

**Files**
- Create: dashboard/src/MonetizationSection.jsx
- Create: dashboard/src/monetization-section.css
- Modify: dashboard/src/App.jsx
- Modify: dashboard/src/style.css only for shared responsive styles if needed.
- Add UI tests only if a compatible test runner exists; otherwise add testable pure helpers and a documented preview test checklist.

**Interfaces**
- Component: MonetizationSection receives existing fetchApi and current admin session identity.
- Use the existing fetchApi authentication wrapper; do not create another auth client.
- Six modules: Overview, Subscription Plans (locked), Subscribers (locked), Ad Providers, Ad Campaigns, Transactions. Placement Manager lives within website placements.
- Page registry starts with Home, Search/results, Movie/series details and Watch/play only if confirmed in the actual public website.

- [ ] Define tests for Phase 2 locks, independent website/Telegram switches, OFF defaults, provider-format warnings, duplicate-zone warnings, multiple placements/page, scheduling, activation confirmation, transaction provenance and mobile layout.
- [ ] Run npm --prefix dashboard run build to record the current baseline.
- [ ] Replace only the Monetization ComingSoonSection branch with the new component; leave AI and Settings unchanged. Build all six modules, clearly lock Premium/Direct Advertiser billing, and implement provider status, campaign controls, placement CRUD, compatibility, frequency/schedule controls, transaction provenance and MAU progress. Activation requires confirmation. All state must persist through the API; no UI-only toggles or secret values.
- [ ] Run npm --prefix dashboard run build. Expected: Vite production build succeeds without import/runtime errors.
- [ ] Run npm test && npm --prefix dashboard run build. Expected: Worker regression suite and dashboard build pass; preview saves/toggles persist after reload.
- [ ] Commit the passing task: feat: build monetization admin workspace.

### Task 4: Website placement runtime and safe provider loading

**Files**
- Create: src/lib/ad-placement-runtime.js
- Create: src/routes/public-ads.js
- Modify: src/index.js
- Create: test/ad-placement-runtime.test.js
- Create: docs/integrations/website-ad-placement-contract.md
- Public website source path is unresolved: the inspected repository contains dashboard/Worker-generated movie share pages, not the public website app.

**Interfaces**
- GET /api/public/ad-placements?page=<registered-page-key>
- Public response contains only active, scheduled, provider-verified placement data safe for browser use.
- Browser integration uses stable slot keys and allowlisted provider loaders; no private credentials or arbitrary executable code.

- [ ] Add failing tests for route targeting, multiple slots/page, disabled/out-of-schedule slots, unsupported formats, duplicate script/zone initialization, secret-free public response and provider failure isolation.
- [ ] Run npm test. Expected: tests fail because the public placement endpoint/runtime is absent.
- [ ] Implement read-only public placement selection and controlled provider templates. Ensure one script/zone initialization per placement. Pop-up remains OFF by default. Video stays unavailable until a supported provider/player passes capability tests. Document the exact browser integration contract and locate the external website source before wiring actual pages.
- [ ] Run npm test. Expected: only compatible active placements are returned; public response contains no private config; duplicate initialization is prevented.
- [ ] Run npm test && npm --prefix dashboard run build. Expected: API, dashboard and existing website share behavior remain green.
- [ ] Commit the passing task: feat: add safe website ad placement runtime.

### Task 5: Telegram campaigns, frequency policy and revenue reporting

**Files**
- Create: src/lib/telegram-ads.js
- Modify: src/routes/telegram.js
- Modify: src/lib/telegram.js only if current send helpers lack required media/card support.
- Create: test/telegram-ads.test.js
- Create: test/monetization-reporting.test.js
- Add src/routes/monetization-delivery.js only if verified provider callback/import endpoints require it.

**Interfaces**
- selectEligibleTelegramAd(env, { bot, user, placement, now })
- deliverTelegramAd(env, { bot, chatId, user, campaign, updateId })
- recordAdDelivery(env, deliveryInput)
- ingestProviderRevenue(env, providerSlug, payload, authContext)
- recordManualRevenue(env, input, actor)
- getMonetizationTransactions(env, filters)
- Approved interaction triggers must be explicitly enumerated after inspecting handleTelegramUpdate; do not inject ads into every callback/message.

- [ ] Add failing tests for text/card delivery, CTA URL, schedule boundaries, per-user cap, cooldown, per-session cap, admin/test exclusion, duplicate update idempotency, campaign state, send failure isolation, provider callback authentication/deduplication, manual revenue provenance, decimal currency and reversal adjustments.
- [ ] Run npm test. Expected: new tests fail because delivery/reporting services are absent.
- [ ] Use existing sendMessage/sendPhoto Bot API helpers. Insert ads only at approved interaction points and without delaying or replacing the main movie response. Persist idempotency key tied to update/campaign/user/placement; enforce frequency limits atomically. Ad send/persistence failure must not break normal movie flow. Import provider earnings only from verified provider report/postback; otherwise offer manual entry with explicit provenance. Delivery counts are not impressions or revenue.
- [ ] Run npm test. Expected: all Telegram delivery, retry, frequency, failure-isolation and revenue-provenance tests pass.
- [ ] Run npm test && npm --prefix dashboard run build. Expected: existing movie import/publish/search/detail/cards, summaries, favorites, sharing, analytics, notifications and Activity Log remain green. Preview confirms OFF defaults, no unsolicited broadcast, no duplicate tags, no secret exposure, and rollback disables monetization without affecting core flows.
- [ ] Commit the passing task: feat: add controlled telegram ad campaigns.

## Unresolved implementation discoveries (not product questions)

1. Public website repository/deployment: not present in inspected repository tree. Locate the actual public website source before claiming page-specific ad placements are integrated. API/runtime contract alone is not full website delivery.
2. Production Supabase migration history and live RLS policies must be verified before any production database change.
3. Admin/test/known-bot identity markers must be verified before MAU calculation; add explicit exclusions if absent.
4. Monetag/Adsterra account APIs, postbacks or export availability must be verified before automated revenue ingestion; manual provenance-labelled entry is the fallback.
5. Provider zone IDs, domain verification and approved account credentials must be supplied/configured by Owner outside source control before live ads can be enabled.
6. Video remains unavailable until a supported provider/player integration is identified and tested.
