# TMDB commercial-use gate — FINDLY Movies

## Project classification

FINDLY Movies is currently in a non-commercial development and testing phase, as confirmed by the project owner. TMDB's published developer FAQ limits free API use to non-commercial purposes and requires commercial licensing for revenue-generating use. Reassess the project classification before any monetization or commercial operation.

Official source: https://developer.themoviedb.org/docs/faq

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

## Alternative source

If TMDB does not grant terms that fit the business model, select a metadata/image provider whose written terms permit the intended commercial use. Do not silently substitute another source without checking its licensing, attribution, image rights, and data-retention terms.
