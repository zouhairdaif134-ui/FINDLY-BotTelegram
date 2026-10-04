# FINDLY — Master Product Behavior Map

## Purpose
This document converts the Product Behavior Reconstruction into a working behavior contract. It separates confirmed behavior from decisions that must not be guessed.

## A. Product Core
| Area | Current evidence | Status | Direction |
|---|---|---|---|
| Platform identity | Multi-bot Worker + Telegram + Supabase + Admin | FACT | Preserve |
| Master Bot | Active master bot launches active child bots | FACT / INTENDED | Preserve, verify sender identity |
| Child Bots | Independent bot records and bot-scoped menus/content | FACT | Preserve |
| Dynamic routing | Telegram webhook uses bot slug | FACT | Preserve |
| Product/business purpose | Not documented | UNKNOWN | Define before business redesign |

## B. Master Bot
### Confirmed
1. An active Master Bot is expected by the current query using single().
2. Active Child Bots are ordered by sort_order.
3. Child Bot buttons use Telegram usernames.
4. Master menu text uses Master Bot identity.
5. /start on the Master Bot opens this menu.

### Verification
- Verify the intended data model allows only one active Master Bot.
- Verify Master links only active Child Bots.
- Verify final outbound Telegram call always uses Master Bot slug.

### Do not assume
- Automatic Child Bot creation.
- Business-specific Master features.
- Any hardcoded bot slug.

## C. Child Bots
### Confirmed
1. Child Bot is resolved by slug.
2. Bot must be active.
3. /start opens its root menu.
4. Menu records are scoped to that bot.
5. Content records are scoped to that bot.

### Intended
Each Child Bot is a self-contained service/content experience inside the FINDLY network.

### Open decision
Define whether every Child Bot follows the same generic menu/content contract or whether some Child Bots have specialized workflows.

## D. User Journey
### Deterministic flow
/start → resolve bot → save Telegram user → associate user with bot → record analytics → Master: show Child Bots / Child: show root menu.

### Menu flow
Root Menu → Menu Item → category | content | URL | submenu → optional Back → optional Home.

### Free text
Unmatched message → AI attempt → if reply exists, send it → otherwise fallback response.

### Open decisions
- Default language behavior.
- Whether AI should answer every unmatched message.
- Whether unknown messages should instead return a structured help/menu response.
- Whether /start parameters have deep-link semantics. Current code accepts a parameter but does not demonstrate parameter-specific behavior.

## E. Menu Contract
### Confirmed
- Tree structure through parent_id.
- Per-bot ownership through bot_id.
- Active-only display.
- Explicit ordering.
- Actions: category, content, url, menu.

### Invariants
1. Menu callbacks resolve only to active items belonging to the current bot.
2. Submenus remain inside the current bot.
3. Back navigation never escapes the current bot.
4. Home points to the active Master Bot.
5. Disabled targets fail safely.

## F. Categories and Content
### Confirmed
- Category has slug/name/icon/description/active state.
- Content references a category.
- Dashboard describes categories as global.
- Content is bot-scoped.
- Telegram displays active content, newest first, with a current limit of ten items.

### Critical ambiguity
Category scope is unresolved.

Possible models:
1. Global category taxonomy shared by all Child Bots.
2. Bot-specific categories.

Current evidence favors global taxonomy + bot-scoped content because Dashboard explicitly labels Categories as global while content queries include bot_id.

### Rule before repair
Do not add bot_id to category lookup until category scope is confirmed.

## G. Content Contract
### Confirmed
- Content is bot-scoped and category-scoped.
- Only active content is shown.
- Ordering favors newest publication date, then creation date.
- External URLs can be displayed.
- Content actions validate content ID and current bot ID.

### Open decisions
- Pagination beyond ten items.
- Image rendering in Telegram.
- Draft/publish workflow.
- Additional content types.
- Metadata semantics.

## H. User Identity
### Confirmed
- Telegram ID is the stable external identity.
- User record is updated on interaction.
- User-to-bot relationship is persisted.
- Last-seen is updated.

### Intended
One Telegram user can interact with multiple Child Bots while retaining one platform identity.

### Open decisions
- Deletion/anonymization.
- Block/unblock.
- Consent/privacy.
- Notification preferences.

## I. Analytics
### Confirmed
Telegram messages/callbacks generate analytics events with bot/user context and event data.

### Intended
Analytics should support usage and performance reporting.

### Gap
Admin Analytics UI is not implemented.

### Open decisions
- Canonical event taxonomy.
- KPI definitions.
- Retention/funnel reporting.
- Error metrics.

## J. AI
### Confirmed
- AI is called for unmatched text.
- Configuration comes from bot_settings.
- A default OpenAI configuration exists.

### Intended
AI acts as a configurable conversational fallback.

### Boundary
AI must not silently become the source of truth for deterministic menu/business operations until explicitly defined.

### Open decisions
- Per-bot enable/disable.
- System prompt.
- Context source.
- Conversation memory.
- Rate limits and cost controls.
- Provider abstraction.
- User-facing AI disclosure.

## K. Notifications
### Confirmed
- Notifications are a distinct product area.
- A notification subscription concept exists.
- Admin UI exists.

### Gap
Complete delivery workflow is not established.

### Open decisions
- Broadcast vs targeted.
- Scheduling.
- Opt-in/opt-out.
- Delivery mechanism.
- Retry policy.

## L. Favorites
### Confirmed
- A favorites backend route exists.

### UNKNOWN
No sufficiently clear end-to-end Telegram product flow has been established.

### Rule
Do not redesign favorites until its intended journey is confirmed.

## M. Monetization
### Confirmed foundation
- Subscription plans.
- User subscriptions.
- Ad providers.
- Ad campaigns.
- Monetization events.
- Monetag and Adsterra provider seeds.

### Intended
Multiple revenue channels are planned.

### Gap
No demonstrated end-to-end monetization journey or admin UI.

### Open decisions
- What is paid?
- Who pays?
- Subscription entitlement model.
- Advertising inventory.
- Provider lifecycle.
- Revenue attribution.
- Refund/cancellation rules.

## N. Authentication / RBAC
### Confirmed
- Supabase Auth.
- JWT verification through JWKS.
- Admin/role/permission data model is referenced.
- API routes enforce authorization.

### Intended
Least-privilege administrative access.

### Open decisions
- Final roles.
- Permission matrix.
- Owner vs super-admin.
- Invitation workflow.
- Audit requirements.

## O. Telegram Reliability
### Confirmed
- (bot_id, update_id) is unique.
- Updates have processing states.
- Processed duplicates are ignored.
- Failed updates are retryable.

### Defect candidate
Stale processing records have no demonstrated timeout/recovery mechanism.

### Required behavior
An abandoned claim must eventually become retryable without allowing simultaneous duplicate processing.

## P. Admin
### Implemented management
Bots, Categories, Menus, Content, Telegram, Users, Notifications.

### Placeholder
Analytics, Monetization, AI, Admins, Activity Log, Settings.

### Intended architecture
Dashboard is the operational control plane; Telegram is the end-user interaction plane.

## Q. Cross-System Invariants
1. Never resolve a Child Bot menu using another bot's menu records.
2. Never resolve content using another bot's content records.
3. Never let a callback from one bot execute a menu item belonging to another bot.
4. Master navigation uses database-managed bot identity.
5. Inactive bots do not accept normal Telegram processing.
6. Duplicate Telegram updates do not produce duplicate user-facing actions.
7. Analytics failure does not break core Telegram interaction unless explicitly changed.
8. AI does not override deterministic configured actions.
9. Admin operations remain authorization-protected.
10. Product semantics are not inferred solely from placeholder UI labels.

## R. Defect / Gap Register
| ID | Finding | Class | Priority | Confidence |
|---|---|---|---|---|
| F-001 | Master menu variable shadowing | DEFECT CANDIDATE | P1 | High |
| F-002 | Category lookup lacks bot_id | DEFECT CANDIDATE | P1 | Medium |
| F-003 | Stale processing update recovery absent | DEFECT CANDIDATE | P1 | High |
| F-004 | Analytics admin UI placeholder | GAP | P2 | High |
| F-005 | Monetization admin UI placeholder | GAP | P2 | High |
| F-006 | AI admin UI placeholder | GAP | P2 | High |
| F-007 | Admin/RBAC UI placeholder | GAP | P2 | High |
| F-008 | Activity Log UI placeholder | GAP | P2 | High |
| F-009 | Settings UI placeholder | GAP | P2 | High |
| F-010 | Product specification absent | GAP | P0 | High |
| F-011 | Foundational schema documentation incomplete | GAP | P1 | High |
| F-012 | Automated Telegram behavior tests absent | GAP | P1 | High |

## S. Repair Sequence
### Phase 1 — Verify
- Verify F-001, F-002, F-003 on current main.
- Inspect complete Telegram/API paths.
- Confirm RBAC enforcement route-by-route.
- Confirm AI invocation conditions.
- Confirm notification/favorites paths.

### Phase 2 — Lock product decisions
Resolve only UNKNOWN items that materially affect implementation:
- category scope;
- Master/Child contract;
- AI role;
- notification model;
- favorites behavior;
- monetization behavior;
- admin roles.

### Phase 3 — One coherent repair
Fix verified P1 defects first without changing confirmed product semantics.

### Phase 4 — Tests
Add deterministic tests for routing, menu isolation, content isolation, duplicate updates, stale-claim recovery and authorization.

### Phase 5 — Dashboard
Implement placeholder modules only after their product contracts are defined.

## T. Explicit Non-Goals
- Do not invent business features.
- Do not redesign Telegram UX without evidence.
- Do not replace AI architecture without a product decision.
- Do not change category schema based only on a suspected collision.
- Do not implement monetization merely because tables exist.
- Do not delete duplicate/legacy files before confirming their role.

## Final Contract
FINDLY is currently best understood as a configurable multi-bot Telegram platform. The Master Bot is the entry point to active Child Bots. Each Child Bot owns a menu tree and bot-scoped content. Users have a reusable Telegram identity across bots. Deterministic configured actions take precedence over AI. The Admin Dashboard is the operational control plane. Analytics, monetization, advanced AI administration, admin management, activity logging and settings are foundations/placeholders rather than fully implemented product modules.

Anything beyond this statement remains UNKNOWN until supported by repository evidence or an explicit product decision.
