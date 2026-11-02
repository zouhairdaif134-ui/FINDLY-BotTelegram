# FINDLY Movies — Technical Review

Status: Research baseline / implementation gate
Date: 2026-11-02
Branch: feat/findly-movies-runtime-hardening

## Executive decision
Use the existing multi-bot Cloudflare Worker and Supabase project. Keep Master and Movies independent by bot slug, separate Telegram token bindings, identity checks, webhook routes, and bot-scoped settings. Do not create a second Worker or copy another bot wholesale.

## Competitor benchmark
| Reference | Findings | Decision |
|---|---|---|
| Orca Movies — https://github.com/mmdju/orca-movies | Repository describes English/Persian movie and TV discovery, smart search, IMDb/Rotten Tomatoes/Metacritic ratings, curated lists and release tracker. No LICENSE file was verified in this audit. | Ideas-only reference; no code reuse. |
| filmigobot — https://github.com/Jisin0/filmigobot | Go serverless inline search; README lists IMDb, JustWatch and OMDb, deployment options and commands. GPL-3.0 confirmed; README explicitly warns data obtained through the bot is not allowed for commercial use. | Do not copy code/data into FINDLY without legal review. |
| MovieRecommendationTgbot — https://github.com/hosseinshaemi/MovieRecommendationTgbot | Recommendation-oriented Telegram bot repository found; LICENSE was not verified. | Research-only; no code reuse. |
| MovieRecommendationBot — https://github.com/sk-uma/MovieRecommendationBot | Candidate surfaced by GitHub repository search; source and license not yet audited. | Not approved for reuse. |

Adopt product patterns: localized search, New/Trending/Popular/Top Rated shelves, movie and series detail pages, attributed ratings with vote counts, watchlists, season/episode navigation, country-specific legal availability, concise inline keyboards, pagination, and clear empty/error states.

## Provider and legal constraints
TMDB is technically suitable for search, trending, recommendations, movie/TV details and artwork. Its official FAQ says free API use is for non-commercial purposes with attribution; revenue-oriented use requires contacting TMDB for a commercial license. Therefore do not connect TMDB to a revenue-generating production service until written commercial permission is obtained. Keep provider integration behind an adapter. Do not scrape IMDb/JustWatch or assume redistribution rights. Metadata access does not grant film distribution rights; playback remains disabled until territorial/time-limited distribution rights and delivery assets are verified.

Official references:
- https://developer.themoviedb.org/docs/faq
- https://developer.themoviedb.org/docs/api-reference/introduction
- https://core.telegram.org/bots/api
- https://core.telegram.org/bots/webhooks

## Proposed architecture
FINDLY Master + FINDLY Movies -> existing Cloudflare Worker findly-v3-api -> bot-slug routing, per-bot token binding, webhook secret validation, shared Telegram transport -> existing FINDLY Supabase project and existing Admin Dashboard.

Rules:
- Never place Telegram/provider secrets in Git, browser responses, logs or dashboard-visible settings.
- Never fall back to Master token for Movies.
- Require Telegram getMe identity to match the configured username before webhook setup.
- Use a separate webhook route and secret for each bot.
- Resolve deep-link title UUIDs server-side and re-check publication and rights status.
- Keep Master working if Movies is disabled or misconfigured.
- No new schema until current schema is rechecked.

## Current FINDLY baseline
- Eight Movies Foundation tables exist: movie_titles, movie_genres, movie_title_genres, movie_external_ids, movie_seasons, movie_episodes, movie_provider_availability, movie_favorites.
- RLS and least-privilege browser grants were previously verified.
- The movies bot row is configuration only, not proof of a live Telegram identity.
- The catalog was previously verified empty; do not seed fake titles.
- Feature PR #1 is Draft and unmerged. Production must not be changed.
- Current feature branch already contains Movies navigation, database-backed lists/details/favorites/seasons/episodes, Master deep links, and an Admin Telegram bot selector. These flows still need tests and live verification.

## Confirmed source-level defect
File: src/lib/movies-bot.js

handleMoviesStart() calls sendHome(env, bot, chatId) for a normal /start, but no sendHome function or binding exists in this module. The existing home renderer is showMoviesHome(env, bot, chatId). This is a confirmed ReferenceError path. It has not yet been recorded as a failing test. Fix using TDD: write a focused test that exercises the public start handler, observe red for the expected ReferenceError, replace the call with the existing renderer, then rerun green.

Other review items requiring tests:
- Search currently uses normalized_title ILIKE only; validate Arabic/Latin normalization and wildcard escaping.
- Help text contains escaped newline sequences; verify actual Telegram rendering.
- Season/episode navigation needs parent context and a useful back path.
- Favorites depend on Telegram-to-internal-user mapping; test first-time registration and cross-user isolation.
- Detail rendering does not yet include all desired fields (genres, cast, director, poster, rating source).
- Catalog ingestion/provider sync is not yet established.
- New-message navigation is used in several places; optimize message editing only after behavior tests.

## Implementation plan
1. Protect: keep main unchanged, PR #1 Draft/unmerged, no Production deploy, no secret readback or webhook mutation.
2. Runtime hardening: tests for /start, deep link, invalid UUID, callback parser, help, search, favorites and bot isolation; fix confirmed defect; run npm test and Wrangler dry-run.
3. Provider: select only after commercial rights review; adapter, rate limits, cache, attribution, sync job; import real metadata only.
4. Live identity: store token as Cloudflare secret TELEGRAM_MOVIES_BOT_TOKEN; verify getMe username; configure /telegram/movies with separate webhook secret; test /start, callbacks, deep links and Master regression.
5. Admin: allowlisted settings, identity/webhook status and secret-configured indicator only; never return secret values; audit sensitive actions.
6. Release: Preview/Production isolation, security review, duplicate-update tests, rollback path and explicit approval. Playback stays disabled without documented rights.

## Acceptance criteria
- Master remains operational if Movies token is absent, invalid or disabled.
- Movies /start and /start movie_<uuid> work.
- Every visible button has a tested action.
- Search returns real catalog/provider data or a truthful empty state.
- Favorites are isolated per user.
- Secrets never cross bot boundaries or reach the dashboard.
- Duplicate webhooks do not duplicate side effects.
- Preview and Production are demonstrably isolated.
- No unlicensed playback links are shown.
