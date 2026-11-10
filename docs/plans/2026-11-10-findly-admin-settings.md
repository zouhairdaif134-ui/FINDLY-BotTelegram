# FINDLY Admin Settings Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Settings placeholder with a secure, audited system-settings workspace and implement a fail-safe maintenance gate for the two Telegram bots.

**Architecture:** Cloudflare Worker remains the only trusted writer to a singleton Supabase system-settings row. The dashboard uses authenticated Worker endpoints and never accesses privileged tables directly. Telegram update processing reads the maintenance state server-side and compares the sender's numeric Telegram ID to the configured owner ID; no username-based bypass is permitted.

**Tech Stack:** Cloudflare Workers, JavaScript ES modules, React/Vite, Supabase/Postgres, Node.js test runner.

## Global Constraints

- Product name is FINDLY only.
- Dashboard navigation labels are French; page content is Arabic RTL.
- Default language is Arabic; timezone is Africa/Casablanca.
- Master Bot and Watch Bot have independent settings and maintenance switches.
- Maintenance must not disable the admin dashboard; the owner may use both bots while maintenance is enabled.
- Owner bypass must use the exact Telegram numeric user ID, never a username.
- Every sensitive setting mutation must be permission-checked and audited.
- Secrets remain in Cloudflare Worker secrets and must never be returned to the dashboard or stored in bot_settings.
- Do not alter existing bot tokens, webhook secrets, Telegram webhooks, media references, or media rights.
- Do not enable maintenance automatically during migration.
- The owner numeric Telegram ID is not currently recorded in retrieved project context. Maintenance switches must remain unavailable until an owner explicitly configures and confirms that numeric ID.
- Video media ingestion testing remains deferred and is not part of this work.

---

### Task 1: Add protected system settings storage and API

**Files:**
- Create: `supabase/migrations/20261111000100_system_settings.sql`
- Create: `src/routes/system-settings.js`
- Modify: `src/index.js`
- Test: `test/system-settings.test.js`

**Interfaces:**
- `GET /api/system-settings` returns sanitized singleton settings.
- `PUT /api/system-settings` validates and persists app name, language, timezone, owner numeric ID, maintenance message, and per-bot maintenance flags.
- Both routes require `settings.manage`.
- All writes produce an administrative audit event.

- [ ] Add tests for migration security, safe defaults, validation, and permission-gated routes.
- [ ] Run focused tests and confirm expected failures.
- [ ] Add the singleton table with RLS and service-role-only access; default both maintenance flags to false.
- [ ] Implement strict server-side validation and audited updates.
- [ ] Run focused tests and the full Worker suite.
- [ ] Commit the independently verified backend deliverable.

### Task 2: Build the Settings dashboard workspace

**Files:**
- Create: `dashboard/src/SettingsSection.jsx`
- Create: `dashboard/src/settings-section.css`
- Modify: `dashboard/src/App.jsx`

**Interfaces:**
- Component receives `fetchApi` and renders Arabic RTL content.
- Navigation label is French: `Paramètres`.
- System identity, language and timezone are shown with agreed defaults.
- Owner Telegram numeric ID must be configured before enabling maintenance.
- Master and Watch maintenance are independent and require explicit confirmation.
- UI reflects server-returned state; no optimistic success.

- [ ] Add component tests where repository tooling supports them; otherwise verify via Vite build and browser review.
- [ ] Replace only the Settings placeholder.
- [ ] Run dashboard build and review the rendered page.

### Task 3: Enforce maintenance safely in Telegram update processing

**Files:**
- Modify: `src/routes/telegram.js`
- Modify: `src/routes/system-settings.js`
- Test: `test/system-settings.test.js`

**Interfaces:**
- Check only user-originated updates for the relevant bot.
- Ignore channel posts and updates without a user sender.
- Allow only the configured numeric owner ID through maintenance.
- Deny normal users with the configured Arabic maintenance message.
- If the owner ID is missing, maintenance cannot be enabled.
- Database read failure must not silently claim maintenance is active.

- [ ] Add tests for normal user denial, owner bypass, bot isolation, and missing owner ID.
- [ ] Implement gate before normal bot command handling.
- [ ] Run focused and full Worker tests.

### Task 4: Review and release

- [ ] Inspect complete diff and migration.
- [ ] Run all Worker tests and dashboard production build.
- [ ] Confirm no secrets or tokens appear in dashboard payloads.
- [ ] Open a draft PR first; convert to ready only after checks pass.
- [ ] Merge only after all checks pass and verify Pages/Worker deployment and live health.
- [ ] Tell the owner when the production dashboard is ready for manual review.

## Explicitly deferred
- Telegram media upload/ingestion test: resume when the owner has a small self-created test video.
- Bot message templates and predefined inline-keyboard action editor: separate follow-on task after the core settings and maintenance behavior is verified; no unsupported actions will be exposed.
