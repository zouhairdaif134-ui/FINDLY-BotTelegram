# Hourly Movie Queue — Design Specification

Date: 2026-11-07
Repository: zouhairdaif134-ui/FINDLY-BotTelegram
Target branch: feat/hourly-movie-queue

## 1. Objective

Add an admin-managed queue of movie/series titles. The system processes at most one queued title per eligible hour, enriches it with TMDB metadata, and prepares it as an unpublished draft for explicit administrator review. Publishing remains a separate, manual action.

## 2. Scope and non-goals

### In scope
- Admin can add one title or paste a newline-separated list.
- Each accepted title is persisted independently and shown with its processing status.
- Existing Cloudflare Worker scheduled handler is reused.
- The existing Cron expression remains unchanged: */5 * * * *.
- One eligible queue item is claimed and processed per hourly slot.
- TMDB search and metadata enrichment are used.
- Successful enrichment creates or updates an unpublished catalog draft.
- Admin can resolve ambiguous matches, retry failures, and approve/reject drafts.
- Queue operations are protected by authenticated admin authorization and idempotency.

### Explicitly out of scope
- Automatic publication.
- Changes to Telegram bot behavior, bot tokens, or other bots.
- Replacing Workers AI or adding OpenAI API dependencies.
- Adding another Worker or scheduler.
- Unrelated catalog/dashboard redesign.
- Any production database migration or deployment before the implementation is reviewed and verified.

## 3. Architecture

The feature consists of an admin dashboard queue interface, authenticated Worker API endpoints for queue CRUD and review actions, a persistent queue store in Supabase/Postgres, an extension to the existing Worker scheduled handler, and TMDB integration through the existing server-side configuration.

The browser must not access service-role credentials. All privileged queue and catalog writes occur server-side after admin authorization.

## 4. Queue lifecycle

Proposed states:
- pending: accepted and waiting for its hourly slot.
- processing: claimed by a worker with a lease.
- needs_review: TMDB returned multiple plausible matches or insufficient confidence.
- ready_for_review: metadata was enriched and a draft is available.
- failed: processing exhausted its retry policy or encountered a non-retryable error.
- rejected: administrator rejected the prepared item.
- published: administrator explicitly published the draft.

State changes must be validated server-side. A rejected or published item must not be silently reprocessed.

## 5. Hourly scheduling and concurrency

- Preserve the current */5 * * * * Cron expression and all existing scheduled tasks.
- Each invocation checks whether the current hourly slot has already been consumed.
- Process no more than one queue item for a given hourly slot.
- Use an atomic database claim/lease operation so concurrent invocations cannot claim the same item or consume the same slot twice.
- Store timestamps in UTC and display them in the dashboard's configured local timezone.
- If there is no pending item, the slot remains unused; do not backfill multiple items later.
- A stale processing lease can be reclaimed safely after its timeout.

## 6. TMDB matching and draft creation

- Search TMDB using the submitted title.
- If one result is clearly suitable, retrieve the full metadata needed by the existing catalog model.
- If multiple results are plausible, set needs_review; do not guess.
- Preserve the submitted query and selected TMDB ID for auditability.
- Use TMDB ID as the external identity for idempotency; do not rely on title text alone.
- Reuse existing catalog import/draft logic wherever possible rather than creating a parallel catalog write path.
- Store poster paths/URLs using the repository's existing image handling conventions.
- No item becomes publicly visible until the existing explicit publish workflow is invoked by an authorized admin.

## 7. Failure handling

- Network errors, TMDB rate limits, and transient server errors are retryable with bounded exponential backoff.
- Invalid input and definitive no-match outcomes are surfaced for admin action rather than retried indefinitely.
- Persist attempt count, last error code/message, next retry time, and timestamps.
- Never delete a submitted queue item merely because processing failed.
- Avoid logging API secrets or unnecessary personal data.

## 8. Security and permissions

- Require an authenticated administrator for all dashboard and API operations.
- Enforce authorization in the Worker, not only in the UI.
- Keep Supabase service-role credentials and TMDB credentials server-side.
- Validate and bound input length and batch size.
- Apply rate limits to queue insertion and retry actions.
- Use parameterized database operations and strict state transition validation.

## 9. Data model

A dedicated queue table is proposed, with immutable queue item ID; submitted and normalized title; state; selected TMDB ID and match metadata; linked catalog draft/title ID; attempt count and retry scheduling fields; lease owner/expiry and hourly slot marker; last error details; and created/updated/processed timestamps plus admin actor reference.

The implementation must inspect the actual production schema and existing migrations before finalizing column names, constraints, and relationships. Use a migration file and a tested rollback plan. Do not apply schema changes directly from the dashboard.

## 10. Admin experience

- Add a dedicated queue section without removing the existing AI configuration panel.
- Support single-title entry and newline-separated bulk entry.
- Show each item's status, submitted title, selected TMDB match (when available), attempts, and last error.
- Provide explicit actions for resolving a match, retrying an eligible failure, opening the generated draft, approving/publishing through the existing workflow, and rejecting.
- Make clear that queue completion does not mean publication.

## 11. Observability

Record structured events for enqueue, claim, TMDB lookup, match resolution, draft creation, retry, failure, rejection, and publication. Include queue item ID and hourly slot ID; exclude secrets.

## 12. Verification requirements

- Unit-test state transitions, hourly-slot gating, idempotency, retries, and stale-lease recovery.
- Test concurrent scheduled invocations and confirm only one item is processed per slot.
- Test no-match, ambiguous-match, TMDB rate-limit, timeout, and database failure paths.
- Test admin authorization and reject non-admin access.
- Verify drafts remain unpublished and public catalog queries cannot see them.
- Run the repository's full CI checks.
- Review migration SQL and rollback procedure.
- Deploy to a non-production environment first if one is configured; otherwise require a deliberate production rollout with a verified rollback path.

## 13. Commercial licensing gate

FINDLY Movies is intended to generate revenue from launch. TMDB's official developer FAQ says its free API is for non-commercial use and directs commercial projects to obtain a commercial license. Therefore all existing TMDB API calls (manual search/import and hourly queue) fail closed unless the Worker variable `TMDB_COMMERCIAL_LICENSE_APPROVED` is exactly `true`. The flag must remain unset until written approval covers the intended commercial use, metadata, images, territories, caching, attribution, and monetization model. See `docs/compliance/TMDB-commercial-use-gate.md`.

## 14. Rollout and safety

The feature must be developed on feat/hourly-movie-queue and proposed through a pull request. Production rollout is a separate step after CI, code review, migration review, and smoke tests. The existing Cron schedule and Telegram bot flows must remain unchanged. No production deployment is part of this design-document commit.
