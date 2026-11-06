Plan: docs/plans/2026-11-06-monetization-phase1.md
Branch: feat/monetization-phase1
Pull request: #16 (draft; base main)
Verified branch head: a55d34a31003f4b697c755cb730c605cc9f266de

Task 1: implementation complete — additive schema, RLS/service-role access, rolling MAU and explicit exclusions, append-only revenue ledger/reversals, campaign metrics, atomic Telegram and website frequency reservations, campaign limits, and website provider-zone uniqueness. A disposable PostgreSQL 17 CI job now applies the full migration to a minimal pre-existing-schema fixture and runs the staging verification SQL; both steps passed. This is PostgreSQL integration evidence, not a migration against the live Supabase project.

Task 2: implementation complete — permission-checked Monetization API, Owner-only provider-zone verification, Telegram delivery after successful bot responses, selected interaction triggers, idempotency/frequency/campaign caps, scheduled activation every five minutes, public website placement reads, visitor-key hashing, and request-origin domain allowlisting. Worker production has NOT been deployed.

Task 3: implementation complete — six-module Monetization Dashboard, Phase 2 subscription/subscriber locks, provider/zone controls, website and Telegram Placement Manager, campaign scheduling/assignment, frequency overrides, MAU exclusions, and revenue ledger provenance/reversals. Website campaigns are independent of Telegram bot records; Telegram campaigns still require a bot.

Task 4: partial — public website placement API, origin/domain verification, privacy-safe visitor frequency enforcement, duplicate-zone protection, and integration documentation exist. Video ads are blocked until a provider-supported player is integrated and verified. Actual rendering on Home/Search/Movie Details/Watch is not implemented because the public consumer website source is not present. The separate findly-v3-api repository contains only a README; Cloudflare Pages project findly-v3-apii builds the admin Dashboard (root_dir=dashboard), not the consumer website.

Task 5: implementation complete — Telegram text and image/card campaign delivery, CTA URL, private-chat and non-bot eligibility, interaction-trigger selection, frequency/cooldown/session limits, idempotency, send-failure isolation, scheduled activation, delivery ledger, and manual/provider-reported revenue provenance. Provider callback ingestion was not added because no verified Monetag/Adsterra report/postback API was available; manual provenance-labelled entries remain the supported path.

Latest CI:
- Node test suite: 79 passed, 0 failed.
- Disposable PostgreSQL 17 migration integration: fixture applied, Phase 1 migration applied, and structural/security/default-off verification SQL passed.
- Worker Wrangler deploy --dry-run: passed.
- Dashboard Vite production build: passed.
- Cloudflare Pages preview build/deployment for findly-bottelegram: passed.
- Cloudflare Pages preview build/deployment for findly-v3-apii: passed (this is also configured to build dashboard/).
- Cloudflare Workers Builds preview check for findly-v3-api: passed. This is not a production deployment.

TDD evidence:
- Video capability gate: test first failed because video formats were accepted; implementation then passed.
- Website campaign independence: test first failed because bot_id was unconditionally required; implementation then passed.
- The other earlier tests were added after some implementation and are not represented as observed red-green cycles.

Release blockers:
1. No Supabase staging branch exists. The disposable PostgreSQL 17 integration job passed without additional Supabase cost, but the migration has not been applied to the actual Supabase project. A Supabase branch quote is USD 0.01344/hour; no paid branch was created. Production migration history currently contains only the four existing migrations through admin_audit_logs; 20261106000500_monetization_controls is NOT applied.
2. Actual consumer website frontend repository/integration target is still missing, so website ad rendering is not end-to-end verifiable.
3. No provider account credentials, real zone IDs or domain verification have been supplied; all ad delivery remains OFF by default.

No Production migration, Worker deployment, Production Pages deployment, provider activation, payment activation, or merge has been performed by this feature branch.
