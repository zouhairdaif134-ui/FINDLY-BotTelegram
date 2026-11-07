# TMDB commercial-use gate — FINDLY Movies

## Project classification

FINDLY Movies is intended to generate revenue from launch. TMDB's published developer FAQ says its free API use is for non-commercial purposes and describes a commercial project as one whose primary purpose is creating revenue for its owner. A commercial license must therefore be obtained before using TMDB data or images in the revenue-generating service.

Official source: https://developer.themoviedb.org/docs/faq

## Required before production activation

1. Contact TMDB sales at the address shown in its current developer FAQ and request written commercial licensing terms for a Morocco-based movie/series discovery product.
2. Describe the exact use: search and metadata ingestion, title descriptions, ratings, genre data, poster/backdrop imagery, caching/storage duration, public display, user volume, and monetization model.
3. Confirm that the license covers both metadata and images, the relevant territories, and the intended commercial model.
4. Confirm any required attribution, logo use, display rules, caching limits, and termination/refresh obligations.
5. Store the written approval and approved terms with the project’s legal/business records. Do not commit private correspondence or license credentials to Git.
6. Only after approval, set the Cloudflare Worker environment variable `TMDB_COMMERCIAL_LICENSE_APPROVED=true` and keep `TMDB_API_KEY` as a Worker secret.
7. Add TMDB attribution to an accessible About/Credits area using the exact notice required by TMDB and its approved logo assets, subject to the signed license.

## Runtime enforcement

All requests routed through the existing TMDB client fail closed unless `TMDB_COMMERCIAL_LICENSE_APPROVED` is exactly the string `true`. The default is disabled. This applies to manual TMDB search/import and the hourly queue, not only the new queue feature.

Do not set the approval flag merely because an API key exists or because the API endpoint responds. An API key is not proof of commercial permission.

## Alternative source

If TMDB does not grant terms that fit the business model, select a metadata/image provider whose written terms permit the intended commercial use. Do not silently substitute another source without checking its licensing, attribution, image rights, and data-retention terms.
