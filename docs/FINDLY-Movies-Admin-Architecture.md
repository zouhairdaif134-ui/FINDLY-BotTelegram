# FINDLY Movies + Admin Master — Architecture Specification

**Status:** Draft 0.2 — audit-backed implementation baseline  
**Updated:** 2026-11-02  
**Repository:** `zouhairdaif134-ui/FINDLY-BotTelegram`

## 1. Product direction

FINDLY is a Telegram-first discovery and media platform composed of two independent Telegram bots and one central Admin Dashboard.

- **FINDLY Master (`slug=findly`)** discovers movies and series, prioritizes new releases, and helps users decide what to watch through spoiler-free summaries, ratings, cast and availability information.
- **FINDLY Movies (`slug=movies`)** owns the separate viewing experience and the authorized media library. It delivers video inside Telegram only when FINDLY has documented distribution rights for the relevant territory and period.
- **Admin Dashboard** controls both bots, catalog operations, integrations, settings, users, permissions, analytics and operational health.

The bots remain independent Telegram identities. They share the existing Cloudflare Worker and Supabase project; no second Worker is justified by the current routing architecture.

## 2. User journeys

### Master discovery
1. User opens FINDLY Master.
2. User selects Movies & Series or searches by title.
3. Master displays New Releases first, with separate Trending, Popular and Classics views.
4. User opens a title and sees poster, release year, genres, rating source and vote count, runtime, cast, director, spoiler-free synopsis and trailer when available.
5. Master checks availability for the user's selected country.
6. If authorized FINDLY media exists, show **Watch in FINDLY Movies**. Otherwise show legal external viewing options where verified, or a clear unavailable status.

### Master-to-Movies handoff
- Master passes the stable internal `movie_titles.id` through a Telegram deep link to the Movies bot.
- Movies resolves the internal ID, verifies publication and rights status, then displays the matching movie or series.
- Unknown IDs, expired rights and unavailable assets return a safe unavailable message.
- Never expose raw storage credentials or unauthorized external media URLs.

### Movies playback
- Movies provides a searchable library, movie details, series seasons and episodes.
- Playback uses Telegram-supported media delivery backed by an authorized asset.
- A delivery event means Telegram accepted/sent media; it is not proof that the user watched the full video.

## 3. Competitor and market research principles

Benchmark Telegram movie bots and international discovery services for:
- New-release discovery and trending feeds.
- Search quality, spelling tolerance and Arabic/Latin title matching.
- Spoiler-free synopsis presentation.
- Ratings with source attribution and vote counts.
- Watchlists, favorites and personalization.
- Country-specific legal streaming availability.
- Fast Telegram navigation and low-message-noise UX.
- Admin automation, moderation and operational analytics.

Do not copy competitor assets or bypass access controls. Provider terms and commercial-use rights must be checked before selecting metadata, images, ratings or streaming availability sources. Morocco is the first regional target; country selection must remain configurable.

## 4. Architecture

```
FINDLY Master Bot ─┐
                   ├── Existing Cloudflare Worker (findly-v3-api)
FINDLY Movies Bot ─┘             │
                                 ├── Telegram Bot API
                                 └── FINDLY Supabase project
                                      ├── existing multi-bot platform tables
                                      ├── movie catalog
                                      ├── provider availability
                                      ├── authorized media layer (later phase)
                                      └── Admin/RBAC and analytics
                         Admin Dashboard ── authenticated Worker API
```

Each bot has its own Telegram token and bot record. The backend selects the bot by slug and scopes menus, content and settings by `bot_id`. Secrets stay in Cloudflare bindings. The dashboard may show whether a secret is configured, never its value.

## 5. Admin Dashboard control plane

### Required modules
1. Overview and system health.
2. Bots: status, identity, webhook status, menu and description.
3. Movie catalog: metadata, publication, genres and external IDs.
4. Series: seasons and episodes.
5. Authorized media library and rights.
6. Metadata providers and synchronization.
7. Search ranking and feed configuration.
8. Recommendations and user preferences.
9. Notifications and scheduled jobs.
10. Users and moderation.
11. Analytics and funnel reporting.
12. Monetization (disabled until business/legal model is approved).
13. AI settings and provider limits.
14. Admins, roles and permissions.
15. Activity/audit log.
16. Integrations and secret-configuration status.
17. System settings and localization.

### Configuration rules
- Operational settings are stored in the database and edited through permission-protected API routes.
- Each setting is scoped to a bot or platform-wide scope explicitly.
- Feature flags allow controlled rollout and rollback.
- Sensitive settings are never returned to the browser.
- Destructive actions require confirmation and are audit logged.
- Admin roles follow least privilege.

## 6. Data model

### Existing tables to reuse after semantic review
`bots`, `bot_settings`, `menu_items`, `categories`, `content_items`, `telegram_users`, `user_bots`, `favorites`, `notification_subscriptions`, `analytics_events`, `admin_profiles`, `admin_roles`, `roles`, `permissions`, `role_permissions`, `telegram_updates`.

### Movies Foundation migration already present in GitHub
- `movie_titles`
- `movie_genres`
- `movie_title_genres`
- `movie_external_ids`
- `movie_seasons`
- `movie_episodes`
- `movie_provider_availability`
- `movie_favorites`

These eight tables were absent from the live FINDLY database during the 2026-11-02 audit. The existing migration has not been applied there.

### Later data model candidates (do not create until designed)
- Media assets, Telegram file references and delivery attempts.
- Rights holder, license scope, territories and validity windows.
- Metadata sync jobs and provider payload provenance.
- User viewing history and recommendation feedback.
- Admin audit log and configurable feature flags.

## 7. Security baseline

- Worker-only Supabase service-role credential.
- Browser access uses authenticated user sessions and permission-checked Worker APIs.
- RLS enabled on exposed tables.
- Public catalog reads only; catalog writes are server/admin-only.
- Favorites are owner-scoped.
- Telegram webhook idempotency RPC is service-role-only.
- Admin APIs verify Supabase user identity, active admin profile, assigned role and required permission.
- Bot token values and webhook secrets are never exposed to the dashboard.
- Rights status is checked before any media delivery.

## 8. Phases and acceptance gates

### Phase 0 — Audit and security
- Confirm correct FINDLY Supabase project and Worker.
- Verify each bot's Telegram identity and webhook status.
- Verify Admin auth and role assignments.
- Restrict privileged RPC execution.
- Confirm no cross-project access to BERRECHID IMMO.

### Phase 1 — Movies Foundation
- Apply the existing eight-table migration only to FINDLY.
- Apply explicit least-privilege table grants.
- Run schema, RLS, policy, trigger and privilege verification.
- No media bytes or playback delivery in this phase.

### Phase 2 — Metadata providers
- Provider adapter interface.
- Licensing review and provider attribution.
- Scheduled sync, deduplication and normalized search.
- New-release and trending ranking inputs.

### Phase 3 — Master Movie Discovery
- Search, feeds, filters, details, favorites and country availability.
- New releases are the default feed priority.

### Phase 4 — Admin Dashboard
- Complete modules and settings management.
- Enforce permissions per action and audit sensitive changes.

### Phase 5 — Movies Bot
- Independent Telegram identity and webhook.
- Deep-link resolution and catalog browsing.
- Series/season/episode navigation.

### Phase 6 — Authorized media delivery
- Rights and territory validation.
- Media ingestion and Telegram delivery.
- Expiry, takedown and delivery monitoring.

### Phase 7 — Recommendations, notifications and analytics
- Personalized ranking, opt-in alerts and funnel metrics.

### Phase 8 — End-to-end testing and gradual release
- Test Master, Movies, Admin, rights checks, security and operational recovery.

## 9. Audit findings on 2026-11-02

### Confirmed
- FINDLY Supabase project: `rcebarvpmpxsosclexyg`, organization `Bot telegram`.
- Existing Worker: `findly-v3-api`.
- Worker bindings include Supabase URL, service-role secret, Telegram bot-token map and webhook secret (secret values were not read).
- Existing bot records include Master (`findly`) and Movies (`movies`).
- Movies bot record exists, but has no menus, content or bot settings.
- Master has an active Movies & Series menu item, currently configured as category action `movies`.
- The eight Movies Foundation tables are absent from the live database.
- Existing Dashboard has Bots, Categories, Menus, Content, Users, Notifications and Telegram sections; Analytics, Monetization, AI, Admins, Activity Log and Settings are placeholders.
- GitHub main is at `57d2f45d87404ddb0132baa28e0d6059d7df6bee`.

### Security finding
The existing `claim_telegram_update(uuid,bigint,text,integer)` function is SECURITY DEFINER and currently executable by `anon` and `authenticated`. A read-only permission test returned FAIL for both public roles and PASS for `service_role`.

A dedicated migration is proposed to revoke public execution and grant execution only to `service_role`. It must be reviewed and applied before expanding the webhook surface.

### Still unverified
- Live Telegram `getMe` and `getWebhookInfo` for Master and Movies.
- Runtime webhook behavior for `/api/telegram/webhook/movies`.
- Whether the configured token map contains the correct Movies token (only the secret binding name was inspected).
- Admin role assignment and live authenticated dashboard access.
- Commercial metadata/image licensing and provider availability API access.

## 10. Implementation constraints

- Do not mix FINDLY and BERRECHID IMMO databases.
- Do not deploy a second Worker unless a concrete isolation or scaling requirement emerges.
- Do not add unauthorized movie/series streams.
- Do not claim a title is watchable in FINDLY unless an authorized asset is active.
- Do not create additional tables before reviewing existing structures and access requirements.
- Do not enable monetization until provider terms, rights and business model are approved.
