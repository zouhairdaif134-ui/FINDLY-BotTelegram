# FINDLY Monetization — Complete Design Specification

**Date:** 2026-11-06  
**Repository:** `zouhairdaif134-ui/FINDLY-BotTelegram`  
**Target:** Admin Dashboard, FINDLY website surfaces, Telegram bot delivery, Cloudflare Worker API, Supabase/PostgreSQL  
**Status:** Approved design; implementation not started  
**Production policy:** No direct production edits. Work on an isolated branch, validate in preview/staging, and merge/deploy only after all acceptance gates pass.

## 1. Product decisions (locked)

1. Monetization has three revenue domains:
   - External advertising revenue (Monetag, Adsterra) — **Phase 1 active scope**.
   - User Premium subscriptions — reserved for Phase 2.
   - Direct advertiser campaigns / advertiser accounts — reserved for Phase 2.
2. Phase 2 eligibility threshold: **1,000 Monthly Active Users (MAU)**, defined as at least one qualifying bot interaction during the rolling 30-day window. Count unique Telegram users, exclude admin/test accounts and known bots. Do not equate registered users with active users. The exact qualifying event and reliable activity timestamp must be verified against the current schema before implementation.
3. Ads must be manageable for both the FINDLY website and Telegram bot from one admin center, with independent channel settings.
4. Dashboard must expose independent enable/disable controls, targeting, placement, scheduling, frequency caps, cooldowns, source selection, status and reporting where the underlying source supports them.
5. Telegram supports two direct campaign presentation types: standalone text messages and image/card messages with title, copy and URL button. These are FINDLY-managed campaigns delivered with Telegram Bot API; Monetag/Adsterra website JavaScript tags are not embedded into Telegram messages.
6. Website ad formats requested: Banner, Native, Pop-up, Video. Availability is provider-dependent. Do not label a format as integrated/available until its provider tag or approved direct creative has been configured and tested. Video remains capability-gated.
7. Multiple placements may exist on the same page. A provider zone/tag must be loaded only once per intended placement; duplicate script injection must be prevented.
8. Pop-up/interstitial formats are supported as configurable capabilities but default to OFF until explicitly configured and approved.
9. User requested full dashboard control. This means every implemented setting must have an authenticated API/database path and an observable effect; UI-only toggles are not acceptable.
10. Do not activate Premium checkout, paid advertiser onboarding, or payment collection in Phase 1.

## 2. Current-state evidence and required discovery

The current `main` branch dashboard file `dashboard/src/App.jsx` includes Monetization in the sidebar but renders it through `ComingSoonSection`. The existing migration `supabase/migrations/20261003000200_monetization_foundation.sql` defines:
- `subscription_plans`
- `user_subscriptions`
- `ad_providers`
- `ad_campaigns`
- `monetization_events`

The migration enables RLS and grants service-role table access. Its presence in the repository does **not** prove it has been applied to production. Existing table definitions do not yet demonstrate complete placement, delivery, frequency-cap, provider-zone, MAU or reporting functionality.

Before schema/API work, implementation must inspect:
- Actual Worker entrypoint, router and deployment configuration.
- Existing bot update handling, message send helpers, bot IDs and user activity writes.
- Website routes/templates and whether the public website is part of this repository or a separate deployment.
- Current Supabase schemas, migration history, RLS policies, indexes, triggers and deployed migration state.
- Existing admin role/permission model and Activity Log integration.
- Existing test scripts, CI, preview environments, environment bindings and secrets.
- Current user identity semantics (Telegram user ID vs internal row ID) and any test/admin account markers.

Do not infer production schema or deployment topology from migration filenames alone. Do not expose secrets in logs, source code, client bundles or this document.

## 3. Scope and delivery phases

### Phase 1A — Foundation and safe controls
- Inspect and reconcile existing monetization tables; write additive migrations only.
- Define provider configuration, placement registry, channel configuration, campaign scheduling, frequency/cooldown policy, delivery records and revenue events.
- Implement authenticated Worker API routes with server-side authorization.
- Add explicit feature flags and safe OFF defaults.
- Add audit events for create/update/activate/pause/delete/configuration changes.
- Build Monetization navigation and Overview/Providers/Campaigns/Placements/Transactions screens.
- Add MAU measurement and display, but do not unlock deferred commercial features automatically.

### Phase 1B — Website ads
- Ad Placement Manager with page/route targeting and multiple named slots per page.
- Slot fields: stable key, channel, page/route pattern, position, format, provider, provider zone/tag reference, status, schedule, priority, frequency policy, fallback and metadata.
- Support Banner and Native placements when a provider's actual tag/creative is configured.
- Support Pop-up/Vignette/OnClick only when provider policy and integration support it; default OFF and apply strict frequency caps.
- Video is a reserved format capability; activate only after a supported video source and tested player/ad tag exist.
- Load provider scripts through a controlled, allowlisted loader. Deduplicate script/zone initialization. Never store executable arbitrary scripts as untrusted admin text.
- Provide preview/simulation that does not generate paid impressions or call live ad tags unless explicitly switched to a controlled test mode.

### Phase 1C — Telegram campaigns
- Campaign types: standalone text and image/card.
- Card fields: image URL or approved Telegram file reference, title, body, CTA label, destination URL.
- Targeting: bot, eligible audience, campaign schedule, placement trigger and enabled state.
- Frequency: per-user maximum, cooldown between ads, maximum per session/conversation window, global campaign cap.
- Avoid sending unsolicited bulk messages. Ads are inserted only at defined interaction points or other explicitly approved delivery triggers; no uncontrolled broadcast to the entire user table.
- Use Telegram Bot API send methods and existing bot identity/configuration. Validate destination URLs and media references.
- Delivery failure must not break the primary movie search/detail response. Record failure and continue normal bot flow.
- If a future Telegram Mini App exists, treat Monetag TMA SDK as a separate integration surface; it is not equivalent to ordinary Bot API messages.

### Phase 1D — Reporting and revenue
- Track FINDLY-owned delivery metrics separately from provider-reported revenue.
- Campaign delivery metrics: attempts, sent, failed, impressions/clicks only where verifiably observable.
- Provider earnings: ingest from an official provider API/postback/export if available and authorized; otherwise provide clearly labelled manual daily/monthly revenue entry/import.
- Never infer earnings from impressions or clicks without a provider-supplied rate/report.
- Transactions page records source, amount, currency, event type, occurrence time, external reference, reconciliation status and provenance.
- Distinguish estimated, reported, manually entered and reconciled values.

### Phase 2 — gated, not implemented in Phase 1
- Premium plan checkout and subscriber lifecycle.
- Direct advertiser self-service/accounts, billing and paid campaign workflow.
- Unlock only after owner confirmation that rolling 30-day MAU has reached 1,000 and after separate payment/legal/provider requirements are approved. MAU threshold is an eligibility gate, not permission to automatically charge users.

## 4. Dashboard information architecture

The Monetization area must contain these six top-level modules:

1. **Overview**
   - Revenue totals by source and period.
   - Provider-reported vs manual/estimated amounts clearly distinguished.
   - Active campaigns and delivery health.
   - Website and Telegram channel status.
   - Rolling 30-day MAU, target 1,000, and progress.
   - Warnings for missing provider configuration, expired schedules, delivery errors and disabled placements.

2. **Subscription Plans** (reserved/locked in Phase 1)
   - Read-only planned module or visibly marked “Phase 2 — locked”.
   - Do not create checkout or activate plans for users in Phase 1.

3. **Subscribers** (reserved/locked in Phase 1)
   - No payment activation or subscription state changes in Phase 1.
   - Existing legacy rows, if any, must not be misrepresented as paid subscribers.

4. **Ad Providers**
   - Monetag, Adsterra and Direct (future).
   - Provider type, enabled state, supported formats, site/zone identifiers, verification status, configuration health and last validation.
   - Secrets are stored only in server-side secret bindings. Dashboard may show configured/not configured and masked identifiers, never secret values.
   - A provider cannot be selected for a live placement until required fields and validation are complete.

5. **Ad Campaigns**
   - Draft, scheduled, active, paused, completed, cancelled, failed states.
   - Channel (website/Telegram/both only when compatible), provider, format, schedule, targeting, frequency policy, creative, destination and reporting.
   - Confirm before activation; pause/stop must take effect promptly.
   - Do not claim third-party provider campaign management when FINDLY only controls placement of the provider's publisher tag.

6. **Transactions**
   - Append-only or correction-by-reversal financial event history.
   - Filter by date, source, currency, status, campaign and provider.
   - No destructive edit of reconciled financial events; corrections create linked adjustment entries.
   - CSV export can be added if supported by current dashboard patterns.

## 5. Ad Placement Manager requirements

The manager is an interactive admin interface, not just a static preview.

### Supported page registry
- Home page.
- Search/results page.
- Movie/series details page.
- Watch/play page, if present and technically suitable.
- Future pages can be registered without changing the placement data model.

### Placement controls
- Add multiple placements per page.
- Choose position: page top, page bottom, between result/movie cards, within content, or explicitly registered page slot.
- Choose channel, format, provider and provider zone.
- Enable/disable each placement independently.
- Configure schedule, priority, frequency cap, cooldown and fallback.
- Preview page/slot layout and validate duplicate zone use.
- Display compatibility warnings when the chosen provider does not support the selected format.
- Never inject arbitrary user-supplied HTML/JavaScript. Provider tags must be managed as trusted server-side configuration or approved static integration templates.

### Frequency policy
- Separate website and Telegram settings.
- Support max impressions per user per rolling window, cooldown and per-session cap.
- Use a first-party pseudonymous website identifier where legally and technically appropriate; do not fingerprint users.
- For Telegram use Telegram user identity internally, never expose raw IDs in analytics UI.
- Enforce caps server-side for Telegram and at the website delivery layer for site placements.
- Admin/test accounts excluded.
- Safe defaults must be conservative and configurable; Pop-up defaults disabled.

## 6. Data model design direction

Reuse compatible existing tables; avoid duplicate competing sources of truth. Expected logical entities (names may adapt to existing schema conventions after inspection):

- Providers: provider identity, type, status, supported format capabilities, public configuration and secret references.
- Provider zones: provider-specific zone/placement identifiers, channel, format, verification state.
- Placements: stable slot key, channel, page/route, position, format, provider/zone, enabled flag, schedule and policy.
- Campaigns: campaign metadata, channel, status, creative, schedule, targeting and placement relation(s).
- Campaign delivery events: attempts, sent/failed, provider callbacks and deduplication/idempotency key.
- Frequency state: pseudonymous user key, campaign/placement key, counts and last shown timestamp with expiry/retention.
- Revenue events: provider-reported/manual/estimated provenance, currency, amount, external reference and reconciliation.
- MAU activity: reliable event timestamp and user key, using existing user activity model where possible rather than creating redundant activity logs.

Schema requirements:
- UUID primary keys where consistent with project.
- Foreign keys, checks, unique constraints and query indexes.
- UTC timestamps.
- Numeric decimal for money; never floating-point.
- Explicit currency code.
- RLS enabled on all admin-sensitive tables.
- Browser clients receive no direct write privileges for privileged monetization operations.
- Service-role use is confined to Worker/server environment.
- Migrations are additive, reviewed and tested against a disposable/test database before any production application.

## 7. API and authorization requirements

The Worker API must follow the existing router/auth conventions discovered during implementation. Expected capabilities:
- Read dashboard summary and MAU.
- List/create/update providers and zones.
- List/create/update placements.
- Preview placement compatibility.
- List/create/update/schedule/activate/pause campaigns.
- Evaluate eligible Telegram ad at an approved bot interaction point.
- Record delivery result idempotently.
- Ingest authorized provider postbacks/imports.
- List and reconcile revenue events.
- Read reports.

Authorization:
- Authenticate every dashboard request.
- Enforce role and granular permission server-side; hiding UI controls is not authorization.
- Owner: full control.
- Manager: only permissions explicitly granted by Owner.
- No anonymous access to management endpoints.
- Validate all inputs, URLs, provider IDs, bot IDs, schedule ranges, currencies and status transitions.
- Rate-limit sensitive endpoints and webhook/postback routes.
- Verify provider signatures/tokens where supported; reject forged callbacks.
- Do not accept earnings or “valued” reward claims from the browser as authoritative.
- Append admin actions to the existing Activity Log, using established actor identity and sanitization patterns.

## 8. UX, reliability and user protection

- Mobile-first responsive dashboard usable on Android.
- Arabic/English labels can follow existing dashboard localization conventions; do not introduce inconsistent UI patterns.
- Show clear states: not configured, draft, scheduled, active, paused, failed, unsupported, locked.
- Dangerous activation/deactivation requires clear confirmation and immediate visible result.
- No ads for admin/test accounts.
- Preserve core movie discovery and viewing experience when ads fail or provider scripts are blocked.
- No forced redirect or deceptive CTA.
- Respect provider policies and applicable privacy/consent requirements; do not deploy push-notification ads or tracking without required consent and provider approval.
- No ad placement may cover critical navigation or misrepresent editorial/movie content as an ad-free organic result.

## 9. Observability and Activity Log

Record, at minimum:
- provider.create/update/enable/disable/validate
- placement.create/update/enable/disable
- campaign.create/update/schedule/activate/pause/cancel
- frequency_policy.update
- revenue.import/manual_entry/adjust/reconcile
- configuration and integration failures

Sanitize secrets, tokens, personal data and raw provider payloads. Preserve before/after snapshots only for safe configuration fields. Reuse the existing append-only Activity Log infrastructure.

## 10. Testing and acceptance criteria

No production deployment is acceptable until all applicable checks pass.

### Database/security
- Migrations apply cleanly to a fresh test DB and upgrade from the current schema.
- RLS prevents anonymous and unauthorized admin access.
- Manager cannot exceed granted permissions; Owner can administer all.
- No secret appears in frontend bundle, API response, logs or Activity Log.
- Constraints, indexes, uniqueness and idempotency are tested.

### Website
- Every registered page/slot can render only its configured placement.
- A provider tag is loaded once per zone/placement.
- Multiple distinct placements on a page work without duplicate script injection.
- Disabled, unscheduled or unsupported placements do not render.
- Frequency cap/cooldown works and admin/test users are excluded.
- Provider script failure does not break page content.
- Pop-up defaults OFF; video remains unavailable until a supported integration is validated.

### Telegram
- Text and image/card campaigns deliver with correct CTA.
- No unsolicited mass broadcast is introduced.
- Frequency limits and scheduling are enforced.
- Duplicate update/retry does not send duplicate ads.
- Failed ad delivery leaves normal bot response intact.
- Admin/test accounts are excluded.

### Reporting
- Delivery events and provider revenue are not conflated.
- Manual/imported/provider-reported provenance is visible.
- Currency and decimal arithmetic are correct.
- Duplicate provider callbacks/import rows are rejected or safely deduplicated.
- MAU is based on unique eligible users in a rolling 30-day window.

### Regression/deployment
- Existing movie import, publish, search, Telegram card, sharing, analytics, notifications and Activity Log tests remain green.
- Build, lint/type checks (if configured), unit/integration tests, Worker dry-run and Pages build pass.
- Preview deployment verified before production.
- Production deployment only after explicit release checklist and verified rollback path.

## 11. Delivery strategy and release safety

- Keep work on a dedicated feature branch and use focused commits.
- Do not edit or reset `main` directly.
- Do not alter production secrets, live provider settings, webhook URLs, payment settings or production database until the relevant feature has passed preview validation and the change is explicitly included in the release.
- Never enable live ads before provider account approval, correct zone IDs, domain verification and test validation.
- Use feature flags with OFF defaults; rollback must disable monetization without affecting the bot/site core.
- Keep schema and API backwards-compatible with existing movie functionality.
- A pull request must include migration notes, changed files, tests, preview evidence, risks and rollback steps.

## 12. Official technical references reviewed

- Telegram Bot API: https://core.telegram.org/bots/api
- Telegram bot features / inline keyboards: https://core.telegram.org/bots/features
- Monetag website ad-tag installation: https://help.monetag.com/en/articles/6726318-how-do-i-get-started-as-a-publisher-paste-the-ad-tag-into-your-website
- Monetag website formats and duplicate-zone guidance: https://help.monetag.com/en/articles/6726726-how-many-ads-can-i-place-on-one-webpage
- Monetag Telegram Mini App SDK formats: https://docs.monetag.com/docs/ad-formats/
- Monetag SDK integration: https://docs.monetag.com/docs/ad-integration/
- Adsterra publisher formats: https://adsterra.com/publishers/

Provider formats and policies can change. Re-verify the selected account's current product capabilities and publisher terms during integration; this document does not assert that every provider supports every requested format.

## 13. Open implementation discoveries (must be resolved before coding)

These are repository/runtime facts to inspect, not questions to push back to the user:
- Confirm actual Worker source path and API route structure.
- Confirm public website code/deployment location and route names.
- Confirm live Supabase migration state and existing RLS policies.
- Confirm existing activity timestamp semantics and admin/test identity markers.
- Confirm available provider APIs/postbacks/export mechanisms for revenue reporting.
- Confirm current dashboard role permissions and mobile layout conventions.

If any discovery changes a locked product decision or materially expands scope, document the discrepancy and request approval before changing the design.
