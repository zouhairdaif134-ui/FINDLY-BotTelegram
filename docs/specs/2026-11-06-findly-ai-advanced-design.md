# FINDLY AI Advanced — Design Specification v1.0

Date: 2026-11-06
Status: Approved by product owner
Target: FINDLY Telegram bots and Admin Dashboard

## Product decisions
- One shared AI orchestration runtime; user data and conversational context are isolated per Telegram user and per bot.
- Hybrid memory: short-lived session context plus persistent movie preferences only after explicit Telegram opt-in.
- User-facing mutations require a clear preview and explicit confirmation. AI never receives unrestricted database write access.
- AI remains disabled by default. Existing bot commands and catalog browsing continue to work when AI is disabled, unavailable, or over quota.
- Prefer free tiers and existing infrastructure. No paid provider, subscription, or production deployment is activated automatically.

## Architecture
Telegram update -> bot-specific AI configuration -> AI orchestrator -> allowlisted read tools / pending confirmed actions -> Telegram response.
The dashboard manages configuration and observability through authenticated, permission-checked API routes.

### Configuration
- Per-bot configuration with global defaults.
- Provider-compatible model and HTTPS endpoint, system prompt, temperature and output-token cap.
- Provider credentials are Cloudflare secrets, never dashboard/database plaintext.
- Safe defaults, strict validation, rate limits, per-user and per-bot quotas.
- No automatic provider failover that could incur cost.

### Memory and privacy
- Session memory has a documented retention/expiry policy.
- Persistent preference storage is disabled until user consent is recorded.
- Consent, revocation, viewing and deletion are explicit operations.
- Memory is keyed by the verified internal user identity and bot scope; Telegram numeric IDs alone are not treated as database authorization.
- Do not store credentials, payment data, or sensitive personal information.

### Knowledge and tools
- Catalog search and recommendations use published FINDLY movie/series records and genre relations.
- Model output must not invent title metadata, ratings, availability or links.
- Tools expose narrow typed operations, not arbitrary SQL or general database access.

### Confirmed actions
- The model may propose supported actions only.
- Server creates a short-lived, user-bound pending action.
- Telegram callback confirmation revalidates user, bot, action, expiry and payload before executing.
- Cancellation, expiry, replay protection and audit events are required.
- Favorites integration must first resolve the identity mismatch between Telegram users and auth.users used by movie_favorites.

### Dashboard
- Overview, bot configuration, provider/model settings, memory policy, tools, logs and usage.
- API routes require existing RBAC permissions; secrets are never returned to clients.
- Usage and cost are estimates based on provider-reported usage where available; never label estimates as settled billing.

## Delivery and safety
- Develop on feat/ai-advanced-phase1; do not merge to main or deploy Production without explicit approval.
- Each phase uses tests-first development and verified CI/build evidence.
- Database migrations are additive, reviewed, and tested for RLS and isolation before any production application.
- First delivery slice is AI Core configuration and safe provider invocation. Memory, tools, actions and dashboard are subsequent slices.
