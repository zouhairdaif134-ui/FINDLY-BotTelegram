# FINDLY Monetization Phase 1 Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a secure, Owner-controlled Phase 1 advertising control plane for FINDLY website and Telegram placements, with Monetag/Adsterra provider setup, campaign scheduling, frequency controls, accurate MAU, and an auditable revenue ledger while Premium and direct advertiser payments remain locked.

**Architecture:** Extend the existing Cloudflare Worker + Supabase service layer, expose permission-checked Monetization APIs, and build a dedicated Dashboard workspace following the existing React section patterns. Telegram delivery is inserted only at explicitly selected interaction triggers and is governed by server-side frequency/idempotency checks. The repository contains Telegram and social-share HTML surfaces but no standalone public website application; website placement configuration can be completed here, while rendering on any separate public website requires its frontend repository or a confirmed integration endpoint.

**Tech Stack:** Cloudflare Workers, JavaScript ES modules, Supabase/PostgreSQL, React, Vite, Node.js built-in test runner, GitHub Actions.

## Global Constraints

- Phase 1 activates external advertising only. Monetag and Adsterra are the approved external providers. Premium subscriptions and direct advertiser campaigns remain reserved and unavailable until rolling 30-day eligible Monthly Active Users reach 1,000 and the Owner explicitly approves activation.
- MAU means distinct eligible Telegram user identities with qualifying activity in the rolling last 30 days; exclude admins, test accounts, inactive accounts, and known Telegram bots. Never count registered accounts as active users.
- Website and Telegram are independent delivery channels with independent placements and frequency settings.
- Website formats: banner, native, popup, and video; video is available only when the selected provider supports it. Telegram formats: standalone text message and image/card message with CTA URL.
- All placements, campaigns, provider zones, and delivery flags default OFF. No provider tags, external scripts, payments, or live ads are enabled by this implementation.
- Provider-zone verification requires an accountable Owner confirmation after a real provider-side test. A verified zone remains inactive until separately enabled.
- Never accept arbitrary HTML/JavaScript from Dashboard input. Never expose provider secrets or credentials to browser code, API responses, or Activity Log details.
- Campaign delivery is interaction-triggered; no uncontrolled bulk Telegram broadcast. Apply max-per-user, cooldown, max-per-session/window, and per-channel controls server-side.
- Delivery attempts/impressions are not revenue. Revenue is recorded only from provider reports or explicit manual ledger entries with provenance; reversals are append-only debit entries.
- Keep existing movie cards, Telegram navigation, Activity Log behavior, and production configuration unchanged unless an integration requires a minimal additive change.
- No Supabase production migration, production Worker deployment, Pages deployment, provider activation, or Production merge until review and verification gates pass.

---

### Task 1: Complete the Monetization database contract and access controls

**Files:**
- Modify: `supabase/migrations/20261106213400_monetization_controls.sql`
- Test: `test/monetization-migration.test.js`
- Test: `test/telegram-user-profile.test.js`

**Interfaces:**
- Database RPC: `public.get_monetization_mau(p_since timestamptz)`
- Database RPC: `public.get_monetization_revenue_summary(p_since timestamptz)`
- Tables: `ad_provider_zones`, `ad_placements`, `ad_campaign_placements`, `ad_frequency_policies`, `ad_delivery_events`, `monetization_user_exclusions`
- Permission codes: `monetization.view`, `monetization.providers.manage`, `monetization.providers.verify`, `monetization.placements.manage`, `monetization.campaigns.manage`, `monetization.transactions.view`, `monetization.transactions.manage`, `monetization.users.manage`

- [ ] **Step 1: Add focused failing assertions**
  - Assert all delivery/configuration tables have RLS enabled, no browser-role writes, and service-role grants.
  - Assert provider verification evidence includes actor, timestamp, and method; active zones must be verified.
  - Assert MAU counts distinct Telegram IDs and excludes inactive, bot, and explicitly excluded identities.
  - Assert revenue summaries group by currency/source/provenance and subtract reversals.
  - Assert delivery events have unique idempotency keys and do not create revenue entries.
- [ ] **Step 2: Verify the relevant failure**
  - Run: `node --test test/monetization-migration.test.js test/telegram-user-profile.test.js`
  - Expected: tests identify each missing schema invariant before the migration change.
- [ ] **Step 3: Implement the additive migration**
  - Preserve the existing foundation tables and add only the channel, placement, provider-zone, frequency, delivery, exclusion, and ledger fields required by the approved specification.
  - Add restrictive checks, indexes, RLS, least-privilege grants, Owner permission seeds, append-only delivery/revenue semantics, MAU RPC, and revenue summary RPC.
  - Make all defaults safe: inactive provider zones, disabled placements, draft campaigns, disabled frequency policies where appropriate.
- [ ] **Step 4: Verify the focused pass**
  - Run: `node --test test/monetization-migration.test.js test/telegram-user-profile.test.js`
  - Expected: all migration contract assertions pass.
- [ ] **Step 5: Run the affected integration check**
  - Run: `npm test`
  - Expected: existing Worker tests and the new migration contract tests pass.
- [ ] **Step 6: Commit the passing deliverable**
  - Commit message: `feat: add secure monetization database controls`

### Task 2: Finish the permission-checked Monetization API and delivery engine

**Files:**
- Modify: `src/lib/monetization.js`
- Modify: `src/routes/monetization.js`
- Modify: `src/routes/telegram.js`
- Modify: `src/index.js`
- Create: `src/lib/telegram-user.js`
- Test: `test/monetization-service.test.js`
- Test: `test/monetization-route.test.js`
- Test: `test/telegram-user-profile.test.js`

**Interfaces:**
- Worker router: `handleMonetizationRoute(env, request, url, helpers)`
- Service operations: `getMonetizationOverview`, `listAdProviders`, `saveAdProvider`, `saveAdProviderZone`, `verifyAdProviderZone`, `setAdProviderZoneStatus`, `listAdPlacements`, `saveAdPlacement`, `listFrequencyPolicies`, `saveFrequencyPolicy`, `listAdCampaigns`, `saveAdCampaign`, `setCampaignStatus`, `addCampaignPlacement`, `removeCampaignPlacement`, `listRevenueEvents`, `recordManualRevenue`, `createRevenueAdjustment`, `listUserExclusions`, `saveUserExclusion`, `deleteUserExclusion`, `listExclusionCandidates`
- Delivery operations to add: a server-only eligible-campaign selector, an atomic per-user frequency/idempotency claim, and a Telegram text/card sender using the existing Telegram API helpers.
- Telegram identity normalizer: `buildTelegramUserProfile(telegramUser)`

- [ ] **Step 1: Add focused failing service and route tests**
  - Cover provider allow-listing, unsafe metadata rejection, HTTPS-only campaign URLs, channel/format compatibility, inactive defaults, role denial, invalid request bodies, duplicate delivery claims, campaign schedule boundaries, per-user cooldown, session/window caps, and idempotent reversals.
  - Verify that Owner verification and enablement are separate actions.
- [ ] **Step 2: Verify the relevant failure**
  - Run: `node --test test/monetization-service.test.js test/monetization-route.test.js`
  - Expected: tests fail on missing delivery operations or invalid permission and state-transition behavior.
- [ ] **Step 3: Implement API and delivery logic**
  - Preserve permission checks per resource and record all successful/failed admin mutations in Activity Log with sanitized details.
  - Require an active external provider and verified active provider zone before a campaign can run.
  - Keep direct advertiser campaign and subscription APIs locked in Phase 1.
  - Add atomic database-backed delivery claims so retries cannot bypass max-per-user, cooldown, or per-session/window limits.
  - Send Telegram ads only after configured interaction triggers, with text or photo/card plus a validated HTTPS CTA; never send bulk broadcasts.
  - Ensure a failed ad send does not interrupt the core bot response.
  - Persist Telegram `is_bot` identity and compute MAU from actual activity timestamps.
- [ ] **Step 4: Verify the focused pass**
  - Run: `node --test test/monetization-service.test.js test/monetization-route.test.js test/telegram-user-profile.test.js`
  - Expected: all service, route, frequency, and identity tests pass.
- [ ] **Step 5: Run the affected integration check**
  - Run: `npm test`
  - Expected: all existing bot behavior tests and Monetization tests pass.
- [ ] **Step 6: Commit the passing deliverable**
  - Commit message: `feat: enforce monetization controls and Telegram delivery`

### Task 3: Build the six-module Monetization Dashboard

**Files:**
- Create: `dashboard/src/MonetizationSection.jsx`
- Create: `dashboard/src/monetization-section.css`
- Modify: `dashboard/src/App.jsx`
- Test: `dashboard build` via the existing workflow

**Interfaces:**
- Component: `MonetizationSection({ fetchApi, currentUserId })`
- API base: `/api/monetization`
- Dashboard session identity: existing `session.user.id`
- Existing visual conventions: `ActivityLogSection.jsx`, `AnalyticsSection.jsx`, `activity-log-section.css`, `analytics-section.css`

- [ ] **Step 1: Define the workspace states and API contract**
  - Implement six navigation tabs: Overview, Subscription Plans, Subscribers, Ad Providers, Ad Campaigns, Transactions.
  - Add the Ad Placement Manager inside the advertising workspace with independent website and Telegram channel controls.
  - Add MAU exclusions and provider-zone verification controls under their relevant admin areas.
- [ ] **Step 2: Verify the relevant failure**
  - Run: `npm --prefix dashboard run build`
  - Expected: current app remains buildable before component integration; component-specific import test is absent until integration.
- [ ] **Step 3: Implement the UI**
  - Overview: revenue by currency/provenance, active campaign counts, delivery counts clearly separated from revenue, rolling MAU and 1,000-user eligibility state.
  - Subscription Plans and Subscribers: visible as reserved/locked until threshold plus explicit Owner activation; no payment activation.
  - Ad Providers: Monetag, Adsterra, Direct shown distinctly; Direct locked; provider zone IDs and verification state; never display secret fields.
  - Ad Campaigns: create/edit, schedule, pause/resume/cancel, assign placements, creative preview, provider/channel/format targeting.
  - Ad Placement Manager: multiple slots per page; Home, Search, Movie/Series Details, Watch, and future page keys; format, position, provider zone, schedule, and enable/disable.
  - Frequency settings: per-channel maximum appearances, cooldown, session/window maximum, campaign/placement overrides.
  - Transactions: immutable revenue list, source, currency, provenance, reconciliation status, and reversal action with required reason.
  - Use permission-denied states, loading states, empty states, validation messages, and confirmation for destructive/status-changing actions.
- [ ] **Step 4: Verify the focused pass**
  - Run: `npm --prefix dashboard run build`
  - Expected: Vite production build succeeds with the Monetization workspace imported.
- [ ] **Step 5: Run the affected integration check**
  - Run: `npm test` and `npm --prefix dashboard run build`
  - Expected: Worker tests and Dashboard build pass.
- [ ] **Step 6: Commit the passing deliverable**
  - Commit message: `feat: add FINDLY monetization admin workspace`

### Task 4: Connect available public website surfaces and verify end-to-end release safety

**Files:**
- Modify if applicable: `src/lib/movie-sharing.js`
- Modify if applicable: `src/index.js`
- Create if applicable: `test/monetization-web-placement.test.js`
- Modify: `docs/specs/2026-11-06-monetization-complete-design.md` only if repository evidence requires a clarification

**Interfaces:**
- Public website placement read contract: read-only, server-filtered active placements by page and slot.
- Existing public HTML surface: `renderMovieSharePage(movie, username, platform, shareOrigin)`
- No separate consumer website frontend is present in the repository tree inspected on 2026-11-06.

- [ ] **Step 1: Add focused failing website-surface tests**
  - Verify only active, scheduled, verified provider zones can be rendered.
  - Verify a provider tag/zone is emitted at most once per page and never accepts admin-supplied executable HTML.
  - Verify popups default OFF and unsupported provider formats are not rendered.
- [ ] **Step 2: Verify the relevant failure**
  - Run: `node --test test/monetization-web-placement.test.js`
  - Expected: tests demonstrate missing website placement rendering before the integration is added.
- [ ] **Step 3: Implement only repository-supported public surfaces**
  - Add a server-filtered website placement response and integrate the existing public movie share page only if the provider integration can be safely represented without arbitrary script injection.
  - Do not fabricate Home/Search/Watch pages or claim they render ads when those public frontend routes are not in this repository.
  - Keep provider script snippets outside editable campaign content and avoid duplicate zone/tag loading.
- [ ] **Step 4: Verify the focused pass**
  - Run: `node --test test/monetization-web-placement.test.js`
  - Expected: supported public HTML surface tests pass; unsupported frontend routes return no ad markup.
- [ ] **Step 5: Run release checks**
  - Run: `npm test` and `npm --prefix dashboard run build`
  - Expected: all Worker tests pass and Dashboard build succeeds.
  - Confirm preview deployment only; production migration, provider activation, Worker deployment, and merge remain blocked until migration state, provider accounts/zones, website integration target, rollback procedure, and final review are verified.
- [ ] **Step 6: Commit the passing deliverable**
  - Commit message: `feat: connect verified website ad placements`

## Unresolved implementation boundaries

1. The repository inspected contains the admin Dashboard, Cloudflare Worker, Telegram bot, and public social-share HTML pages, but no separate public consumer website application. The actual website repository/domain or a supported embed/API contract must be identified before Home, Search, Details, and Watch placements can be rendered there.
2. Monetag and Adsterra zone IDs, supported format availability, and account-side verification must come from the user's provider accounts; the implementation must not invent those values or activate unverified zones.
3. The Phase 2 threshold is measurable in the backend, but Premium payment provider, prices, and entitlement rules remain locked and are not implemented in Phase 1.
