# FINDLY — Product Behavior Reconstruction

## Status
Audit-only reconstruction. No production behavior is intentionally changed by this document.

## 1. Product Identity
**FACT**
- FINDLY is implemented as a Cloudflare Worker API with Supabase persistence and a Vite/React admin dashboard.
- Telegram is the primary user interaction surface.
- The backend routes Telegram traffic by bot slug.
- The repository supports multiple Telegram bots.

**INTENDED BEHAVIOR**
- FINDLY is a configurable multi-bot Telegram platform rather than a single hardcoded bot.
- A Master Bot acts as the central entry point and directs users to active Child Bots.
- Child Bots provide independently configured menus/content.

**UNKNOWN**
- The final business purpose of each Child Bot.
- The final commercial/product positioning of FINDLY.
- Whether Child Bots represent services, channels, businesses, or another domain concept.

## 2. Master Bot
**FACT**
- The backend identifies an active bot with bot_type = master.
- Active Child Bots are loaded with bot_type = child and ordered by sort_order.
- The Master menu links to Child Bot Telegram usernames.
- The current implementation uses database-derived bot slugs/usernames rather than a fixed findly slug.

**INTENDED BEHAVIOR**
- Master Bot is the central launcher/gateway.
- Master Bot should remain independent of Child Bot business logic.

**DEFECT CANDIDATE**
- sendMasterMenu() reuses the variable name bot inside the Child Bot loop, creating variable shadowing. This must be verified before repair because it can affect which bot is used for the final sendMessage() call.

## 3. Child Bots
**FACT**
- Child Bots have database-managed identity and presentation fields: id, name, slug, Telegram username, description, icon, active state and sort order.
- /start on a Child Bot opens its menu tree.

**INTENDED BEHAVIOR**
- Each Child Bot owns its own navigation and content context.

## 4. Telegram User Journey
**FACT**
- Telegram updates are resolved to a bot by slug.
- Telegram users are persisted and linked to the current bot.
- /start opens the Master menu for a Master Bot and the Child menu for a Child Bot.
- /help explains how to return to the main menu.
- Callback buttons drive menu navigation.
- Nested menus support back and home navigation.
- Unknown text can be passed to the AI layer.

**INTENDED FLOW**
1. User opens a Telegram bot.
2. /start is received.
3. Master Bot presents Child Bots, or Child Bot presents its menu.
4. User selects a menu item.
5. The system resolves the configured action.
6. Category/content/menu/URL behavior is executed.
7. Unknown free text may fall through to AI.

## 5. Menu System
**FACT**
- menu_items are scoped by bot_id.
- Menu hierarchy uses parent_id.
- Items support category, content, url, and menu actions.
- Items have active state and ordering.
- Back and home navigation are generated dynamically.

**INTENDED BEHAVIOR**
- Admins can construct a per-bot navigation tree without changing Telegram routing code.

## 6. Categories and Content
**FACT**
- Categories have name, slug, icon, description and active state.
- Content is scoped to a bot and category.
- Content supports title, description, content type, image URL, external URL, metadata, publication date and active state.
- Telegram displays up to ten active items ordered by publication/creation date.

**DEFECT CANDIDATE**
- Category lookup in sendCategory() is constrained by slug and active state but not by bot_id. This can allow a category slug collision across bots to resolve outside the current bot context.

**UNKNOWN**
- Whether categories are intentionally global or intended to be bot-specific. Dashboard wording calls them global content categories, while content is bot-scoped. This must be resolved before changing schema or behavior.

## 7. Users
**FACT**
- Telegram identity is stored in telegram_users.
- Bot membership is represented by user_bots.
- User fields include Telegram ID, username, first/last name, language, active state and first/last seen timestamps.

**INTENDED BEHAVIOR**
- FINDLY maintains a reusable Telegram user identity and tracks bot participation.

## 8. Analytics
**FACT**
- Telegram messages/callbacks are recorded as analytics events.
- Events include bot/user context and event data such as update ID, callback action and command.

**INTENDED BEHAVIOR**
- FINDLY should provide measurable usage data.

**PLACEHOLDER**
- The Admin Analytics section currently renders a Coming Soon view.

## 9. AI
**FACT**
- Telegram free-text processing calls generateAIReply().
- AI configuration is read from bot_settings using the ai setting.
- The AI layer has a default OpenAI Chat Completions model configuration.

**INTENDED BEHAVIOR**
- AI is a conversational fallback/configurable capability for Telegram bots.

**UNKNOWN**
- Exact AI product role, prompt strategy, knowledge sources, limits, billing rules and whether AI should be enabled for every Child Bot.

## 10. Notifications
**FACT**
- A Notifications admin section exists.
- A notification subscription concept exists in the backend/data model.
- Notifications are represented as a distinct dashboard capability.

**UNKNOWN**
- Full end-user notification lifecycle and delivery rules.

## 11. Favorites
**FACT**
- A favorites route exists.

**UNKNOWN**
- Complete user-facing favorites behavior and how it fits the Telegram product journey.

## 12. Monetization
**FACT**
- A monetization foundation migration defines subscription plans, user subscriptions, ad providers, ad campaigns and monetization events.
- The migration explicitly identifies user subscriptions, direct advertising and external ad platforms as revenue sources.
- Monetag and Adsterra are seeded as providers.
- Admin Monetization currently renders Coming Soon.

**INTENDED BEHAVIOR**
- FINDLY is designed to support multiple monetization channels.

**STATUS**
- Foundation exists; production monetization behavior is not demonstrated by the current dashboard implementation.

## 13. Authentication and RBAC
**FACT**
- Dashboard authentication uses Supabase Auth.
- Backend authorization verifies Supabase JWTs through JWKS.
- Permission/role data is referenced through admin/RBAC tables.
- Dashboard presents an Owner/Full Access concept.

**INTENDED BEHAVIOR**
- Administrative access is permission-based rather than relying only on a single hardcoded owner.

**UNKNOWN**
- Final role hierarchy and exact permission matrix.

## 14. Telegram Update Reliability
**FACT**
- telegram_updates records (bot_id, update_id) uniquely.
- Updates move through processing, processed and failed states.
- Duplicate processed updates are rejected.
- Failed updates can be retried.

**DEFECT CANDIDATE**
- A Worker failure after claiming an update can leave it in processing, and the current claim logic does not show a timeout/recovery mechanism for stale processing records.

## 15. Admin Dashboard
**FACT**
Implemented management sections include:
- Overview
- Bots
- Categories
- Menus
- Content
- Telegram
- Users
- Notifications

**PLACEHOLDER**
- Analytics
- Monetization
- AI
- Admins
- Activity Log
- Settings

These sections currently use a Coming Soon component.

## 16. Documentation / Source of Truth
**FACT**
- README is minimal and does not define the product behavior.
- No authoritative product specification was found in the repository.
- Several runtime tables are referenced by application code without complete corresponding schema documentation in the current migration set.

**RISK**
- Code structure can be mistaken for confirmed business requirements.
- Repairs made before product behavior is confirmed can lock in accidental behavior.

## 17. Priority Audit Findings
### P0 — Must resolve before behavioral redesign
1. Final product definition and Child Bot purpose.
2. Global-vs-bot-scoped category semantics.
3. Exact intended Master Bot flow.
4. Exact AI role and boundaries.

### P1 — High-confidence technical defects to verify
1. Master menu variable shadowing.
2. Category lookup missing bot context.
3. Stale processing Telegram updates.

### P1 — Product implementation gaps
1. Analytics admin UI.
2. Monetization admin UI.
3. AI configuration UI.
4. Admin/RBAC management UI.
5. Activity Log UI.
6. Settings UI.

### P2 — Maintainability
1. Complete repository product documentation.
2. Complete database schema/migration coverage.
3. Automated tests for Telegram routing and idempotency.
4. Deployment/operations documentation.

## 18. Repair Boundary
Do not change product semantics merely to make code look cleaner.

Before implementation changes:
- confirm intended behavior where evidence is only inference/unknown;
- verify each defect against the current main branch;
- preserve existing working behavior unless the reconstruction establishes that it is wrong;
- implement fixes as one coherent patch;
- deploy only after the patch is internally consistent;
- test Master Bot, Child Bot, menus, categories/content, user persistence, AI fallback, webhook behavior and duplicate update handling.

## Conclusion
The current repository contains a real multi-bot Telegram platform foundation, not only scaffolding. The main remaining risk is not lack of code; it is the absence of a single authoritative product behavior definition. This reconstruction therefore separates confirmed implementation from intended behavior, inference, unknowns and defect candidates before any repair is applied.
