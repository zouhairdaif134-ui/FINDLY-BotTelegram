# FINDLY Activity Log Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a protected, append-only FINDLY Admin Activity Log that records administrative changes and important actions with authenticated actor attribution.

**Architecture:** The Cloudflare Worker remains the only trusted writer and reader for dashboard requests. A PostgreSQL migration creates the append-only audit store and narrowly granted RPC functions; each covered database mutation and its audit record execute in one PostgreSQL transaction. The dashboard reads through a permission-checked Worker endpoint and never writes audit rows directly.

**Tech Stack:** Cloudflare Workers, JavaScript ES modules, Supabase JS v2, PostgreSQL 17, Supabase RLS and RPC, React 19, Vite, Node test runner, GitHub Actions.

## Global Constraints

- Keep `admin_audit_logs` separate from `analytics_events`.
- Derive actor identity from the verified server-side admin session; never trust a client-provided actor ID or name.
- Audit writes for committed database mutations must be atomic with the business mutation.
- The audit table is append-only: no dashboard/API update or delete path.
- Only the trusted Worker service role can write or read audit rows through restricted RPC functions.
- Add a dedicated `activity.view` permission. Grant it to Owner initially; other roles are denied unless explicitly assigned the permission.
- Never store passwords, access tokens, Telegram bot tokens, API keys, secrets, authorization headers, or credential-bearing values in audit payloads.
- Preserve current behavior and data; no destructive schema/data changes.
- Keep the current Activity Log navigation label and replace only its placeholder.
- Do not modify the Manager workflow or redesign the existing Admins section beyond what is needed for audit authorization.
- Do not deploy application code before the additive database migration is applied and verified. Do not deploy if CI or database security checks fail.

---

### Task 1: Database audit foundation and atomic mutation RPC

**Files:**
- Create: `supabase/migrations/20261106000400_admin_audit_logs.sql`
- Test: `test/admin-audit-migration.test.js` (static migration contract tests)
- Test: production Supabase SQL verification queries executed before Worker rollout

**Interfaces:**
- RPC `admin_audit_mutate(p_actor_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_operation text, p_payload jsonb) returns jsonb`.
- RPC `admin_audit_record_event(p_actor_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb) returns uuid` for non-mutating events such as share initiation.
- RPC `admin_audit_record_failure(p_actor_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb) returns uuid` for failed/denied attempts recorded after the failed transaction.
- RPC `admin_audit_list(...filters...)` returns paginated, sanitized audit records for the trusted Worker.
- All RPCs are restricted to `service_role`; revoke default execution from `PUBLIC`, `anon`, and `authenticated`.

- [ ] **Step 1: Add focused migration contract tests**

Assert the migration defines the audit table, enables RLS, defines the four RPCs, creates the `activity.view` permission idempotently, assigns it to the Owner role only, and revokes direct table/RPC access from public client roles.

- [ ] **Step 2: Verify the expected test failure**

Run: `npm test`

Expected: the new migration contract test fails because the migration file does not yet exist.

- [ ] **Step 3: Implement the additive migration**

Create `admin_audit_logs` with UUID ID, actor ID/name snapshot, stable action code, entity type/ID, sanitized details, old/new JSONB snapshots, result, and database-generated timestamp. Add indexes for time, actor, action, and entity queries. Enable RLS and create no client-facing policies. Explicitly revoke table privileges from `anon` and `authenticated`; grant only the service role what the internal RPC path requires.

Implement recursive JSON sanitization that removes credential-like keys at every object depth. Implement a strict entity/operation/column allowlist for mutations. The mutation RPC must lock and capture the previous row for updates/deletes, execute the allowlisted insert/update/delete, capture the resulting row, sanitize snapshots, and insert exactly one audit row before the same transaction commits. If any step fails, raise and roll back the complete transaction. Reject unsupported entity types, operations, columns, and missing actor profiles.

Support first-wave database entities: `movie_titles`, `bots`, `categories`, `content_items`, `telegram_users`, and `bot_settings`. Preserve existing soft-delete semantics for bots, categories, and content; movie and setting deletes retain their existing hard-delete behavior. Add a dedicated database operation for administrator profile/role changes so those related DB writes and the audit row commit together. Auth email invitation remains an external side effect; retain the existing compensation behavior if the database transaction fails.

The event and failure RPCs insert sanitized records without pretending that a rolled-back mutation committed. They are for share events and post-failure/denied-attempt records only.

- [ ] **Step 4: Verify migration contract tests**

Run: `npm test`

Expected: all migration contract assertions pass.

- [ ] **Step 5: Verify the migration against the target database**

Apply the migration to Supabase project `rcebarvpmpxsosclexyg` only after the branch code and CI checks are ready for rollout. Verify table/RLS state, function signatures and grants, Owner permission assignment, and prove that `anon`/ `authenticated` cannot read, insert, update, or delete audit rows or execute privileged RPCs. Verify `service_role` can call the list/mutation RPCs.

- [ ] **Step 6: Commit the passing deliverable**

Commit only the migration and its focused test.

### Task 2: Worker API and audit every covered administrative operation

**Files:**
- Create: `src/lib/admin-audit.js`
- Create: `src/routes/activity.js`
- Modify: `src/index.js`
- Modify: `src/routes/content.js`
- Modify: `src/routes/bots.js`
- Modify: `src/routes/categories.js`
- Modify: `src/routes/users.js`
- Modify: `src/routes/settings.js`
- Modify: `src/routes/admins.js`
- Test: `test/admin-audit.test.js`
- Test: focused route tests for each covered operation

**Interfaces:**
- `recordAdminMutation(env, actor, { action, entityType, entityId, operation, payload })` calls the atomic mutation RPC using `actor.userId` and the server-verified profile name.
- `recordAdminEvent(env, actor, { action, entityType, entityId, details })` records a non-mutating event.
- `recordAdminFailure(env, actor, { action, entityType, entityId, details })` records a sanitized failure after the original transaction has rolled back.
- `getActivityLogs(env, filters)` calls the restricted list RPC.
- `GET /api/activity` requires `activity.view`; filters include page/limit, date range, actor, action, entity type, and result.

- [ ] **Step 1: Add failing tests for actor derivation, sanitization, endpoint permission, and audit operation mapping**

Assert that the helper always takes actor ID/name from the verified `authorizeRequest` result, strips nested secret/token/password/API-key fields, maps each operation to a stable action code, and never reports success when the mutation RPC fails.

- [ ] **Step 2: Verify the relevant failures**

Run: `npm test`

Expected: the new helper and route tests fail because the helper and endpoint do not exist.

- [ ] **Step 3: Implement Worker audit helpers and read endpoint**

Use the existing `authorizeRequest` flow and `getSupabase(env)` service-role client. Do not add client-provided actor fields. Enforce `activity.view` before reading. Validate pagination/filter shape and use the restricted list RPC. Return newest records first and stable pagination metadata.

Instrument:
- Movies: manual create/edit/status publish/deactivate/delete and TMDB import (including linked external ID/genre writes as one database transaction).
- Bots and categories: create/update/deactivate.
- Content: create/update/deactivate.
- Telegram user accounts: activate/deactivate.
- Bot settings: create/update/delete.
- Admins: invite, activation/deactivation, display-name and role changes. Keep the external Auth invitation saga and compensate by deleting the invited Auth user if the atomic database step fails.
- Publishing/sharing: record Facebook/Instagram share initiation as an event using the same stored movie ID.

For each failed database mutation, allow the database transaction to roll back, then record a sanitized failure event separately and return the original error. Do not log request headers, tokens, full environment values, or unfiltered payloads.

- [ ] **Step 4: Verify focused tests**

Run: `npm test`

Expected: helper and route tests pass, including actor spoofing rejection and sanitized failure records.

- [ ] **Step 5: Run the full Worker test suite**

Run: `npm test`

Expected: all existing and new tests pass; no existing Telegram, movie-card, share, admin, or analytics behavior regresses.

- [ ] **Step 6: Commit the passing deliverable**

Commit the Worker API and route instrumentation separately from the dashboard.

### Task 3: Activity Log dashboard

**Files:**
- Create: `dashboard/src/ActivityLogSection.jsx`
- Create: `dashboard/src/activity-log-section.css`
- Modify: `dashboard/src/App.jsx`
- Test: dashboard build and manual authenticated browser verification

**Interfaces:**
- Component `ActivityLogSection({ fetchApi })` calls only `GET /api/activity`.
- Dashboard passes the existing authenticated `fetchApi` helper.
- Unauthorized users receive a clear access-denied state; no audit data is loaded into unauthorized sessions.

- [ ] **Step 1: Add the Activity Log component and integrate it into the existing section switch**

Keep the current navigation label. Remove the Activity Log `ComingSoonSection` placeholder only. Do not alter the Manager module or unrelated dashboard sections.

- [ ] **Step 2: Implement activity list and filters**

Display actor, action, target, timestamp, and result. Add filters for date range, actor, action, entity type, and result; add pagination and a detail panel for sanitized before/after snapshots. Provide refresh and explicit loading, empty, and error states. Do not render credential-like keys even if returned unexpectedly.

- [ ] **Step 3: Build the dashboard**

Run: `npm run build --prefix dashboard`

Expected: Vite build completes without errors.

- [ ] **Step 4: Verify authenticated behavior**

Use the production dashboard preview after deployment to confirm Owner can open Activity Log, records render newest first, filters/pagination work, and a role without `activity.view` gets a 403 state with no audit data.

- [ ] **Step 5: Commit the dashboard deliverable**

Commit only the Activity Log component, styles, and App integration.

### Task 4: Production rollout and verification

**Files:**
- Modify only if required by verified test failures in the preceding tasks.
- Production targets: Supabase project `rcebarvpmpxsosclexyg`, Worker `findly-v3-api`, Pages site `findly-bottelegram`.

- [ ] **Step 1: Run all automated checks on the feature branch**

Run: `npm test` and `npm run build --prefix dashboard`.

Expected: all tests and build pass. GitHub Actions checks for the branch/PR are green.

- [ ] **Step 2: Apply the additive database migration first**

Apply the committed migration to the confirmed Supabase project. This is additive only. Verify schema, RLS, grants, RPC behavior, and Owner permission before deploying Worker code. Do not proceed if any privilege check fails.

- [ ] **Step 3: Merge the reviewed PR to main**

Merge only after all required checks are green and the migration is verified. The existing GitHub Actions deployment workflow deploys the Worker from `main`; Cloudflare Pages production deploy follows the configured main-branch pipeline.

- [ ] **Step 4: Verify Production**

Check Worker health, authenticated `GET /api/activity`, 403 for a non-authorized role, one safe create/update/deactivate test operation, exactly one matching audit row, and rollback behavior when the audit RPC is forced to fail in a controlled test. Confirm that the dashboard displays the record and no secrets appear.

- [ ] **Step 5: Report the release**

Report the PR/merge commit, migration version, Worker deployment status, Pages deployment status, and test evidence. Do not claim Production completion unless each is verified.

## Unresolved implementation seams

- Auth invitation email delivery cannot participate in a PostgreSQL transaction. The existing compensation flow remains; the admin profile, role assignment, and audit row must be atomic with one another.
- The initial permission policy is least-privilege: `activity.view` is assigned to Owner only. Manager and Content Manager remain denied until an authorized permission assignment is made.
- Audit failure records are separate records created after rollback; they must never imply that the failed business mutation committed.
