# TMDB commercial-use gate — FINDLY Movies

## Project classification

FINDLY Movies is currently in a non-commercial development and testing phase, as confirmed by the project owner. TMDB's published developer FAQ limits free API use to non-commercial purposes and requires commercial licensing for revenue-generating use. Reassess the project classification before any monetization or commercial operation.

Official source: https://developer.themoviedb.org/docs/faq

## What counts as commercial use

Treat every revenue-generating or paid-access feature as commercial use for this project, including third-party advertising, sponsored placements, affiliate revenue, paid subscriptions, and Telegram Stars Premium subscriptions. Using Telegram Stars rather than a card processor does not change the licensing gate.

Until written TMDB approval covers the intended use:
- Keep `system_settings.ads_enabled=false`.
- Do not load Monetag, AdsGram, or any other advertising SDK in production.
- Do not activate Premium/Stars payments or paid access.
- Keep the Mini App ad SDK runtime disabled. The Worker also requires `TMDB_COMMERCIAL_LICENSE_APPROVED=true` before it will return an enabled ad configuration; this flag must only be set after written approval.

## Non-commercial development mode

For a genuinely non-commercial development/test phase, the Worker may be configured with `TMDB_NONCOMMERCIAL_DEVELOPMENT=true`. This is a separate mode and does not represent or imply commercial approval. Use it only while the service is genuinely non-commercial, keep imported items as drafts, and do not monetize or publicly operate the service under this mode. Turn it off before any commercial launch. The existing `TMDB_COMMERCIAL_LICENSE_APPROVED=true` flag remains reserved for written commercial approval.

## Required before commercial activation

1. Contact TMDB sales at the address shown in its current developer FAQ and request written commercial licensing terms for a Morocco-based movie/series discovery product.
2. Describe the exact use: search and metadata ingestion, title descriptions, ratings, genre data, poster/backdrop imagery, caching/storage duration, public display, user volume, and monetization model.
3. Confirm that the license covers both metadata and images, the relevant territories, and the intended commercial model.
4. Confirm any required attribution, logo use, display rules, caching limits, and termination/refresh obligations.
5. Store the written approval and approved terms with the project’s legal/business records. Do not commit private correspondence or license credentials to Git.
6. Only after approval, set the Cloudflare Worker environment variable `TMDB_COMMERCIAL_LICENSE_APPROVED=true` and keep `TMDB_API_KEY` as a Worker secret.
7. Add TMDB attribution to an accessible About/Credits area using the exact notice required by TMDB and its approved logo assets, subject to the signed license.

## Runtime enforcement

All requests routed through the existing TMDB client fail closed by default. They are enabled only when either `TMDB_NONCOMMERCIAL_DEVELOPMENT=true` for genuinely non-commercial development/testing, or `TMDB_COMMERCIAL_LICENSE_APPROVED=true` after written commercial approval. The development flag is not a commercial license and must be disabled before monetization or commercial operation. This applies to manual TMDB search/import and the hourly queue.

Do not set the approval flag merely because an API key exists or because the API endpoint responds. An API key is not proof of commercial permission.

## Phase 1 implementation guard

The Mini App ad control plane may be deployed for structural testing while remaining invisible to users. Its global database switch defaults to OFF, the provider SDK remains disabled, and the server-side configuration is fail-closed unless the written commercial-license approval flag is present. A failed or missing configuration request must produce no ad markup and no reserved blank space.

## Alternative source

If TMDB does not grant terms that fit the business model, select a metadata/image provider whose written terms permit the intended commercial use. Do not silently substitute another source without checking its licensing, attribution, image rights, and data-retention terms.
