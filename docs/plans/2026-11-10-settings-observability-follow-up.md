# FINDLY Settings Observability Follow-up

## Goal
Replace the Settings page's unavailable Worker error-spike indicator with a real, privacy-preserving signal, while keeping authentication-log limitations explicit.

## Scope
- Capture only Worker API 5xx failures in a private Supabase table.
- Never store request bodies, tokens, passwords, IP addresses, or raw exception messages.
- Aggregate the last 60 minutes for the Settings security panel.
- Keep Supabase Auth login logs clearly marked as externally available but not queryable by the FINDLY Worker until database audit-log storage or a supported log-drain integration is configured.
- Preserve the no-automatic-lockout rule.

## Files and interfaces
- `supabase/migrations/20261110120000_settings_worker_error_monitoring.sql`: private event table, RLS, service-role-only grants.
- `src/lib/worker-error-log.js`: `normalizeWorkerErrorEvent` and best-effort `recordWorkerError`.
- `src/index.js`: asynchronously record API 5xx errors without changing response behavior.
- `src/routes/security-alerts.js`: last-hour count and sanitized recent events.
- `dashboard/src/SettingsSection.jsx` and `dashboard/src/settings-section.css`: display the live count and alert level.
- `test/settings-worker-error-monitoring.test.js`: normalization and threshold tests.
- `supabase/tests/settings_worker_error_monitoring_verification.sql`: verify RLS and grants.
- `.github/workflows/findly-tests.yml`: apply and verify the migration in disposable PostgreSQL CI.

## Security constraints
- RLS enabled; revoke access from public, anon, authenticated.
- Only service_role can read/write event rows.
- Keep event fields bounded and allowlisted.
- Record only server-generated 5xx outcomes.
- Failure to persist metrics must not fail the original Worker request.
- No automatic bot shutdown.

## Verification
- Run `npm test`.
- Run `npx wrangler@4.156.1 deploy --dry-run`.
- CI applies the migration to disposable PostgreSQL and checks grants.
- After merge, apply the migration to the production Supabase project and verify table/RLS/grants.
- Verify Pages production and Worker deployment point to the merged main commit.

## Explicit limitation
Supabase Auth events are present in the provider's `auth_logs` stream, but `auth.audit_log_entries` currently has no stored rows. The dashboard must not claim to count failed logins until Postgres audit-log storage or an authenticated log-drain integration is configured.
