# Hourly Movie Queue Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an admin-managed hourly movie metadata queue that creates unpublished FINDLY catalog drafts and never publishes automatically.

**Architecture:** Reuse the existing Cloudflare Worker scheduled handler, TMDB server integration, Supabase service-role client, audit mutation path, and React dashboard. Supabase Postgres owns the queue and unique UTC hourly claims; the existing five-minute Cron remains unchanged.

**Tech Stack:** Cloudflare Workers, JavaScript ES modules, Supabase/PostgreSQL, React, Node.js built-in test runner.

## Global Constraints

- Preserve the existing `*/5 * * * *` Cron and all scheduled tasks.
- Process at most one queue item per UTC hourly slot.
- Do not auto-publish any title; imports remain drafts.
- Keep service credentials and TMDB credentials server-side.
- Protect every queue API with existing administrator authorization.
- Do not deploy or apply migrations to production as part of this implementation.
- Commercial use of TMDB must remain gated on written permission/licensing; development may continue without enabling production TMDB calls.

---

### Task 1: Make queue persistence and hourly claiming safe

**Files:**
- Modify: `supabase/migrations/20261107020000_movie_queue.sql`
- Modify: `supabase/tests/movie_queue_base_fixture.sql`
- Modify: `supabase/tests/movie_queue_verification.sql`

**Interfaces:**
- Produces: `public.movie_queue_items`, `public.movie_queue_slots`, and `public.claim_next_movie_queue_item(timestamptz,timestamptz)`.
- The claim function is callable only by `service_role`, atomically consumes one UTC slot while claiming one due pending row, and assigns a unique fencing token to the claim.

- [x] Add database-level protection against duplicate active queue titles using a partial unique index on `(media_type, normalized_title)` for pending, processing, needs_review, ready_for_review, and already_in_catalog states.
- [x] Extend the disposable PostgreSQL fixture with the Supabase roles required by the migration (`anon`, `authenticated`, and `service_role` with BYPASSRLS).
- [x] Extend SQL verification to assert the unique index rejects active duplicates and that rejected/failed rows do not reserve active-title uniqueness.
- [ ] Run the queue migration and verification SQL in the repository's disposable PostgreSQL workflow; expected outcome is a clean migration and all assertions passing.

### Task 2: Make queue insertion and scheduled audit attribution reliable

**Files:**
- Modify: `src/lib/movie-queue.js`
- Test: `src/lib/movie-queue.test.js`

**Interfaces:**
- Consumes: `normalizeMovieQueueTitle`, `searchTmdbCatalog`, `importTmdbCatalogItem`, and `claim_next_movie_queue_item`.
- Produces: `enqueueMovieQueue(env, body, actor)` with deterministic duplicate reporting, and scheduled imports attributed to the administrator who submitted the queue item.

- [x] Add focused tests for punctuation-only titles and duplicate normalization.
- [x] Reject titles that normalize to an empty key; handle PostgreSQL unique-violation races as duplicates rather than failing the entire batch.
- [x] Replace selection of an arbitrary active administrator with the queue item's `created_by` identity for audit attribution; fail safely if no submitting administrator is recorded.
- [x] Run `npm test`; all queue unit tests passed on the verified PR head.

### Task 3: Prevent duplicate manual resolution and preserve draft-only behavior

**Files:**
- Modify: `supabase/migrations/20261107020000_movie_queue.sql`
- Modify: `src/lib/movie-queue.js`
- Modify: `supabase/tests/movie_queue_verification.sql`
- Test: `src/lib/movie-queue.test.js`

**Interfaces:**
- Produces: an atomic queue-item resolution claim that allows only one administrator request to resolve a `needs_review` item at a time.
- Reuses the existing TMDB import function, which creates catalog records with `status='draft'`.

- [x] Add an atomic SQL claim operation for manual match resolution, restricted to `service_role`.
- [x] Claim the item before importing; restore `needs_review` if the import fails, and return a conflict if another request already claimed it.
- [x] Verify imported catalog status remains draft and that queue resolution never sets catalog status to active.
- [x] Run focused Node and SQL verification; PostgreSQL checks confirm single resolver claims, active-title uniqueness during resolution, and stale lease-token rejection.

### Task 4: Verify integration and open review

**Files:**
- Review: `src/index.js`, `dashboard/src/MovieQueueSection.jsx`, `dashboard/src/App.jsx`, `wrangler.jsonc`
- Review: `.github/workflows/findly-tests.yml`

**Interfaces:**
- Existing API routes remain under `/api/movies/queue`; existing dashboard navigation remains `Movie Queue`.
- Existing scheduled handler continues invoking `processMovieQueueHourly` without changing other scheduled work.

- [x] Verify all queue endpoints require the expected existing content permissions.
- [x] Verify the five-minute Cron is unchanged and the dashboard clearly states that queue completion is not publication.
- [x] Run `npm test`, SQL migration verification, dashboard build, and the Worker dry-run used by CI; both GitHub Actions workflows passed on commit `3481e17`.
- [x] Keep the existing draft pull request #24 updated after the checks passed; production migration and deployment remain a separate, licensed rollout.

## Unresolved external decision

- Before enabling TMDB-backed metadata retrieval in a revenue-generating production service, obtain written confirmation that the planned commercial use and image/metadata display are covered by TMDB's applicable license or replace TMDB with a source whose commercial terms permit the intended use.
