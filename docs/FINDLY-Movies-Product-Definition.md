# FINDLY Movies & Series — Product Definition

**Status:** Product definition / planning baseline  
**Category:** 🎬 الأفلام والمسلسلات  
**Slug:** movies  
**Parent experience:** FINDLY Master Bot  
**Scope:** Movies + TV Series discovery, authorized Telegram media delivery, legal viewing guidance, and a scalable Telegram media-library architecture  
**Version:** v1.2

## 1. Purpose

The 🎬 Movies & Series category is intended to become a professional entertainment-discovery product inside FINDLY.

It is not intended to be a simple Telegram channel containing uploaded movies.

The core idea is:

> Help the user discover a movie or series, understand what it is, watch its trailer, save it, find a legitimate viewing source when one is available, and eventually support direct Telegram delivery where FINDLY has the necessary distribution rights.

The user should experience the category as a small movie hub inside Telegram, while FINDLY keeps the underlying movie data, search, normalization, analytics, recommendation logic, and media-delivery metadata in its own backend.

## 2. Product Vision

Target experience:

    FINDLY Master Bot
           |
           v
    🎬 Movies & Series
           |
           +--> 🔎 Search
           +--> 🔥 Popular
           +--> 🆕 New / Recent
           +--> 📺 Series
           +--> 🎭 Genres
           +--> 🌍 Countries / Languages
           +--> ⭐ Top Rated
           +--> ❤️ Favorites
           +--> 🎯 Recommendations
           +--> ▶️ Watch / Delivery

A user should be able to move from discovery to a useful action without leaving Telegram unnecessarily.

## 3. Telegram UX

### Category entry

    🎬 FINDLY MOVIES

    شنو بغيتي تشوف؟

    🔎 بحث عن فيلم أو مسلسل
    🔥 الأكثر شعبية
    🆕 الجديد
    📺 المسلسلات
    🎭 حسب النوع
    🌍 حسب البلد
    ⭐ الأعلى تقييماً
    ❤️ المفضلة

    [ 🏠 FINDLY ]

The exact labels can be refined during UI implementation, but the experience should remain simple and fast.

## 4. Search

The primary interaction should be movie/series search.

Example:

    🔎 Interstellar

Possible result:

    🎬 Interstellar

    ⭐ 8.7/10
    📅 2014
    🎭 Sci-Fi · Drama · Adventure

    [ ℹ️ التفاصيل ]

Search must eventually support:

- Original title
- Localized title
- Alternative titles
- Movie title
- Series title
- Fuzzy / normalized matching
- Relevant metadata

Search should not depend on a Telegram channel's message history.

## 5. Movie / Series Details

Example:

    🎬 Interstellar

    ⭐ 8.7/10
    📅 2014
    ⏱ 2h 49min

    🎭 Sci-Fi · Drama · Adventure

    📝 قصة الفيلم...

    👨‍🚀 Matthew McConaughey
    👩‍🚀 Anne Hathaway

    [ ▶️ Trailer ]
    [ 🔗 أين أشاهده؟ ]
    [ ❤️ أضف للمفضلة ]

    [ ◀️ الرجوع ]

For a series, the detail experience should later support:

- Seasons
- Episodes
- Episode count
- Release status
- Current season
- Episode-level metadata

## 6. Legal Viewing Model

FINDLY should not become a repository for pirated movies or series.

The product should not:

- Upload copyrighted movies without authorization
- Store pirated movie files
- Distribute unauthorized copies through Telegram
- Link users to known piracy sources as if they were official providers
- Build a private Telegram file archive for copyrighted content

Telegram's technical ability to send video/files does not establish copyright permission.

Instead, FINDLY should provide a legal discovery layer:

    Movie
      |
      +--> Trailer
      |
      +--> Official / authorized viewing source
      |
      +--> Availability by country
      |
      +--> Authorized FINDLY media delivery (future)

Where reliable provider data is available, the user can see services for streaming, rental, purchase, or another authorized source.

Important: Provider integrations must be validated before implementation. Do not invent availability or provider URLs.

## 7. Authorized Telegram Media Delivery

The media-delivery layer is part of the Movies architecture from the beginning. It must be implemented only for content FINDLY is legally authorized to distribute, but the database model, media library, bot flow, and Telegram storage architecture should be designed now so the product does not require a later rewrite.

    Bot
      ↓
    FINDLY Media Channel / Private Channel
      ↓
    Authorized Video / File
      ↓
    User

This is an **authorized product capability**. It must never be implemented as an unauthorized movie-distribution system.

### Intended model

The future system may use a dedicated Telegram channel as a controlled media storage/distribution layer.

A user can select, when an authorized media asset exists:

    🎬 Movie / Episode
           ↓
    ▶️ Watch / Get in Telegram
           ↓
    FINDLY Bot
           ↓
    Authorized media source
           ↓
    Telegram delivery to user

The implementation may use Telegram's file/message identifiers so FINDLY does not unnecessarily re-upload the same authorized media for every user.

### Authorization requirement

Direct media delivery is allowed in the product design only for content that FINDLY has the legal right to distribute through Telegram.

That may include, depending on rights:

- Public-domain content
- Content released under a license permitting redistribution
- Content owned by FINDLY
- Content for which FINDLY has obtained explicit distribution rights
- Other content where the rights holder has expressly authorized this delivery model

A private Telegram channel is a technical storage/distribution mechanism; making a channel private does not make unauthorized copyrighted distribution legal.

### Architecture requirement

The database and backend must keep authorized media separate from the public movie catalog while making the delivery path a first-class, production-planned capability.

Conceptually:

    Movie / Series Catalog
            |
            +--> Metadata
            +--> Trailer
            +--> Legal Provider Availability
            |
            +--> Authorized Media Assets (future)
                         |
                         +--> Telegram Channel Message ID
                         +--> Telegram File ID
                         +--> Media Type
                         +--> Quality / Variant
                         +--> Rights Status
                         +--> Rights / License Reference
                         +--> Availability Status
                         +--> Verification Timestamp

Media rights and catalog metadata must be separate concerns.

### Future media lifecycle

    Authorized Asset
          ↓
    Rights Verification
          ↓
    Ingest to FINDLY Media Channel
          ↓
    Store Telegram identifiers
          ↓
    Link asset to Movie / Series / Episode
          ↓
    User requests delivery
          ↓
    Validate asset + rights status
          ↓
    Bot sends authorized media
          ↓
    Record delivery analytics

The exact Telegram implementation must be designed and reviewed when this phase is activated.

### No premature implementation

The current Movies MVP should focus on discovery, metadata, trailers, legal viewing options, and the core product experience.

The future media-delivery architecture should be **planned now but activated only after rights, storage, operational, and Telegram implementation requirements are verified**.

## 8. Trailer Experience

Trailer is a first-class feature.

Preferred flow:

    Movie Details
         |
         +--> ▶️ Trailer

The implementation should use an authorized/public trailer source where permitted, rather than hosting copyrighted full-length movies.

Potential provider integrations can be evaluated during implementation. No provider is considered mandatory by this document until its API/data rights, limits, and commercial terms are verified.

## 9. Discovery Features

The first versions should prioritize discovery over complexity.

Planned discovery surfaces:

1. 🔥 Popular
2. 🆕 Recent / New
3. ⭐ Top Rated
4. 📺 Series
5. 🎭 Genres
6. 🌍 Countries / Languages
7. 🔎 Search
8. ❤️ Favorites

Later:

9. 🎯 Personalized recommendations
10. 👀 Continue exploring
11. Similar movies
12. Similar series
13. Trending by region

## 10. Favorites

Users should eventually be able to save:

- Movies
- Series

Example:

    ❤️ المفضلة

    🎬 Interstellar
    📺 Breaking Bad
    🎬 Inception

    [ فتح ]
    [ إزالة ]

Favorites should be associated with the authenticated FINDLY user identity, not with a Telegram message alone.

## 11. User Preferences

Later versions may store:

- Preferred language
- Preferred genres
- Preferred countries
- Favorite titles
- Favorite actors/directors
- Viewing-provider preferences
- Notification preferences

This enables recommendations without making the first version unnecessarily complex.

## 12. Notifications

Notifications are planned, but should not be activated prematurely.

Possible future notifications:

- New season
- New episode
- Movie availability
- New trailer
- New release
- Personalized recommendations

The notification system should reuse FINDLY's broader notification architecture instead of creating an isolated movie-only notification system.

## 13. Telegram Architecture

The Master Bot remains the primary user-facing entry point.

Current Master menu already defines:

- Label: الأفلام والمسلسلات
- Icon: 🎬
- Category slug/action: movies

The Movies category should plug into the existing category routing architecture rather than creating a second Master Bot.

Target flow:

    Master Menu
       |
       | action_value = movies
       v
    Movies Router
       |
       +--> Movies UI
       +--> Search
       +--> Details
       +--> Favorites
       +--> Trailer
       +--> Legal provider links
       +--> Future authorized media delivery

Navigation should prefer editing the existing Telegram message where practical, so the user experiences the bot as a compact application rather than a long stream of unrelated messages.

## 14. Backend Architecture

Movies should become a dedicated domain.

Conceptually:

    src/lib/movies.js
    src/lib/movies-ui.js
    src/routes/telegram.js
           |
           v
    Supabase
           |
           +--> movie/series catalog
           +--> genres
           +--> people
           +--> providers
           +--> favorites
           +--> source synchronization
           +--> analytics
           +--> future authorized media assets

Do not mix movie-domain logic into the Jobs implementation.

The Jobs system is a reference for engineering patterns such as ingestion, normalization, deduplication, scheduling, and analytics, but Movies should have its own domain model.

## 15. Data Model Direction

The exact schema must be designed and reviewed before migration.

Expected logical entities include:

### Titles

Common fields may include:

- id
- type: movie / series
- canonical title
- original title
- overview
- release date
- runtime
- rating
- vote count
- poster
- backdrop
- language
- country
- status
- source identifiers
- raw metadata

### Genres

- id
- name
- slug

### Title Genres

Many-to-many relationship between titles and genres.

### People

Potentially:

- actors
- directors
- writers
- other important credits

### Title Credits

Relationship between titles and people.

### Seasons

For series.

### Episodes

For series seasons.

### Providers

Authorized viewing services.

### Title Providers

Availability relationship between a title and provider, potentially including:

- country
- provider type
- URL
- availability type
- last verified timestamp

### Favorites

User-to-title relationship.

### Authorized Media Assets

Separate entity for authorized watchable/downloadable Telegram media. This is part of the production architecture, while actual assets are populated only after rights verification.

Potential fields:

- id
- title_id
- season_id
- episode_id
- media_type
- telegram_channel_id
- telegram_message_id
- telegram_file_id
- quality
- rights_status
- rights_reference
- availability_status
- verified_at
- created_at
- updated_at

The exact schema must be finalized before the media migration. The table may be introduced as part of the Movies foundation only after the rights and operational fields are agreed; it must remain separate from title metadata.

### Movie Analytics

Potential events:

- search
- open result
- open details
- trailer click
- provider click
- favorite
- share
- future media delivery request
- future media delivery success

The schema should remain minimal in v1 and expand only when a real feature requires it.

## 16. Ingestion / Synchronization

Movies will require a reliable metadata source.

The ingestion architecture should follow the same general principles already used in FINDLY Jobs:

    External Source
         |
         v
       Fetch
         |
         v
      Normalize
         |
         v
       Validate
         |
         v
     Deduplicate
         |
         v
        Upsert
         |
         v
    FINDLY Movies Catalog

Important rules:

- Never invent movie metadata.
- Preserve source identifiers.
- Use deterministic deduplication.
- Track synchronization timestamps.
- Preserve raw source data where useful.
- Record source failures.
- Respect API rate limits and terms.
- Do not activate a source until its availability and permitted use are verified.

## 17. Source Strategy

Potential source categories to evaluate:

### A. Movie metadata provider

For:

- titles
- posters
- descriptions
- genres
- ratings
- cast
- release dates
- seasons / episodes

### B. Trailer source

For authorized trailer discovery.

### C. Viewing availability provider

For:

- streaming availability
- rental
- purchase
- country-specific availability

### D. Future authorized media source

For content that FINDLY is explicitly permitted to distribute.

These should be evaluated independently.

**No source should be hardcoded into the architecture before technical, licensing, API-limit, and reliability checks are completed.**

## 18. Regionalization

FINDLY is initially focused on Morocco.

Therefore the viewing-provider layer should eventually support Morocco first.

Provider availability must be treated as country-specific data.

A movie being available on a service in another country must not be presented as available in Morocco without verified regional data.

Future media delivery rights must also be verified for the intended distribution territory where applicable.

## 19. Sharing

Users should eventually be able to share a FINDLY movie/series result.

Preferred model:

    https://t.me/FindlySearch2026Bot?start=movie_<id>

The deep link should reopen the relevant FINDLY title.

This follows the existing FINDLY deep-link pattern already used for Jobs.

## 20. Analytics

Movies should use the existing FINDLY analytics philosophy.

Useful events:

- movies_open
- movies_search
- movie_open
- movie_trailer_click
- movie_provider_click
- movie_favorite_add
- movie_favorite_remove
- movie_share
- future_movie_media_request
- future_movie_media_delivery

Analytics should be user-aware where an authenticated user exists.

Do not collect unnecessary personal data.

## 21. Premium Opportunities

Premium should come later, after the free discovery experience has real usage.

Potential premium features:

- Advanced filters
- Personalized recommendations
- More notification controls
- Watchlists
- Advanced discovery
- Early alerts
- Premium recommendation engine

The basic movie discovery experience should remain useful without Premium.

## 22. MVP Definition

### Phase 1 — Foundation

- Movies domain schema
- Metadata source integration
- Normalization
- Deduplication
- Search
- Movie details
- Telegram category UI
- Trailer link
- Legal viewing/provider link where verified
- Basic analytics

### Phase 2 — Product depth

- Series
- Seasons
- Episodes
- Favorites
- Genres
- Popular / Top Rated / Recent
- Deep links
- Sharing

### Phase 3 — Intelligence

- Recommendations
- Personalized discovery
- Notifications
- Similar titles
- User preferences

### Phase 4 — Future Authorized Telegram Media Delivery

Only after the preceding product is stable and rights are confirmed:

- Rights/authorization model
- Media asset management
- FINDLY media channel
- Telegram message/file identifier storage
- Authorized media ingestion
- User delivery flow
- Delivery analytics
- Access and rights-status validation
- Operational monitoring

### Phase 6 — Monetization

- Premium discovery features
- Commercial partnerships where appropriate
- Provider/referral opportunities where legally and commercially supported

## 23. What We Must NOT Build

The following are explicitly outside the FINDLY Movies product direction:

- Pirated movie repository
- Unauthorized Telegram movie archive
- Automatic copying of movies from piracy channels
- Scraping piracy channels as a movie source
- Unauthorized redistribution of copyrighted files
- Fake streaming links
- Fake provider availability
- Fake ratings or metadata
- Using a private Telegram channel as a way to bypass copyright restrictions

The product must be built around **discovery + metadata + trailers + legitimate viewing guidance**, with future direct Telegram media delivery limited to content FINDLY is authorized to distribute.

## 24. Engineering Principles

1. **Inspect before changing.**
2. **Validate the product requirement before writing code.**
3. **Use real production logic, not placeholder scaffolding.**
4. **Keep Movies isolated as a domain.**
5. **Reuse proven FINDLY infrastructure where appropriate.**
6. **Do not duplicate Jobs logic unnecessarily.**
7. **Do not invent external APIs or data.**
8. **Track source provenance.**
9. **Design for Morocco first.**
10. **Build the Telegram UX as an application-like experience.**
11. **Keep callback data compact and deterministic.**
12. **Treat legal availability as a product requirement, not an afterthought.**
13. **Design future authorized media delivery separately from movie metadata.**
14. **Never assume that technical Telegram access equals distribution rights.**
15. **Do not activate media delivery until authorization and operational requirements are verified.**

## 25. Product Success Criteria

The target end-to-end discovery experience is:

    Open FINDLY
       ↓
    🎬 الأفلام والمسلسلات
       ↓
    Search "Interstellar"
       ↓
    Open title
       ↓
    Read details
       ↓
    Watch trailer
       ↓
    See legitimate viewing options in Morocco
       ↓
    Save / Share

The future authorized-delivery experience may additionally become:

    Open FINDLY
       ↓
    Select authorized title / episode
       ↓
    ▶️ Watch / Get in Telegram
       ↓
    FINDLY validates availability + rights status
       ↓
    Bot retrieves authorized Telegram media
       ↓
    Bot delivers video/file
       ↓
    Record delivery event

If these flows are fast, reliable, visually clean, and based on verified data and valid rights, FINDLY Movies becomes a genuine product category rather than simply another Telegram menu button.

## 26. Source of Truth

This document defines the initial product direction for the FINDLY 🎬 Movies & Series category, including the planned future authorized Telegram media-delivery capability.

Before implementing the database or application code:

1. Inspect the current FINDLY repository.
2. Confirm the existing Telegram routing and Master Menu behavior.
3. Evaluate candidate metadata, trailer, provider, and future media sources.
4. Verify API access, limits, terms, and permitted use.
5. Design the minimum production database schema.
6. Ensure the schema can evolve toward authorized media delivery without coupling rights-sensitive data to the public catalog.
7. Implement incrementally.
8. Verify every production path before moving to the next phase.

**This document is a product definition, not permission to implement every feature immediately.**

## 27. Research-Backed Implementation Architecture

This section records the engineering conventions established after reviewing the current FINDLY repository, official Telegram Bot API documentation, relevant open-source Telegram movie/file architectures, and TMDB's current API documentation.

### 27.0 Agreed end-to-end Movies map

The agreed product flow is now:

    FINDLY Master Bot
          |
          v
    🎬 الأفلام والمسلسلات
          |
          +--> 🔎 Search by movie/series name
          |
          v
    Search Results
          |
          v
    🎬 Title Details
          |
          +--> Poster / Backdrop
          +--> Title / Original Title
          +--> Story / Overview
          +--> Rating
          +--> Year / Release Date
          +--> Genres
          +--> Cast / Credits
          +--> Trailer
          +--> Seasons / Episodes (series)
          +--> Legitimate Provider Availability
          |
          +--> ▶️ مشاهدة  [only when authorized media is available]
          |
          +--> ⬇️ تحميل   [only when authorized download is permitted]
          |
          +--> ❤️ Favorite
          +--> 📤 Share
          |
          v
    FINDLY Media Flow
          |
          +--> FINDLY Media Bot (if deployed as a separate bot)
          |
          v
    FINDLY Private Media Channel
          |
          +--> Telegram message_id
          +--> Telegram file_id
          +--> Media type / quality
          +--> Rights status / reference
          |
          v
    User receives authorized media

The catalog and media storage are deliberately separate:

    Supabase = movie/series library + metadata + provider availability
    Telegram Media Channel = authorized media storage/delivery layer

Supabase does not store the large movie/video files themselves.

### 27.0.1 Media library model

The media library must be indexed, not treated as an unstructured Telegram channel.

Example movie:

    🎬 Interstellar
       |
       +--> 1080p -> Telegram message/file reference
       +--> 720p  -> Telegram message/file reference

Example series:

    📺 Series
       |
       +--> Season 1
       |      +--> Episode 1 -> Telegram media reference
       |      +--> Episode 2 -> Telegram media reference
       |
       +--> Season 2
              +--> Episode 1 -> Telegram media reference

The user should search and select titles through FINDLY's database, not search Telegram channel history directly.

### 27.0.2 Media delivery rule

A title can exist in the catalog without having FINDLY media. Therefore the UI must distinguish:

- **Catalog only** — information/trailer/provider availability.
- **Authorized media available** — Watch/Download can be offered.
- **Media unavailable/blocked** — no delivery action is exposed.

This prevents the product from pretending that every movie in the catalog is directly watchable through FINDLY.

## 27. Research-Backed Implementation Architecture

This section records the engineering conventions established after reviewing the current FINDLY repository, official Telegram Bot API documentation, relevant open-source Telegram movie/file architectures, and TMDB's current API documentation.

### 27.1 Existing FINDLY structure to preserve

The current Worker already separates responsibilities into:

    src/index.js
        |
        +--> routes/
        |      +--> telegram.js
        |      +--> categories.js
        |      +--> content.js
        |      +--> favorites.js
        |      +--> notifications.js
        |      +--> analytics.js
        |      +--> ...
        |
        +--> lib/
               +--> telegram.js
               +--> supabase.js
               +--> auth.js
               +--> jobs.js
               +--> jobs-ui.js
               +--> job-delivery.js
               +--> ...

Movies should follow this established pattern instead of creating a new architectural style.

### 27.2 Planned Movies files

The preferred first structure is:

    src/lib/movies.js
        Metadata access, synchronization, normalization,
        deduplication and movie/series domain operations.

    src/lib/movies-ui.js
        Telegram presentation, keyboards, pagination,
        details screens and navigation.

    src/lib/movie-providers.js
        Viewing-provider availability and provider normalization.

    src/lib/movie-media.js
        Future authorized Telegram media assets and delivery.
        This file must remain separate from metadata logic.

    src/routes/telegram.js
        Thin integration point that delegates movies: callbacks
        and movie deep links to movies-ui/domain handlers.

    supabase/migrations/YYYYMMDDxxxx_movies_foundation.sql
        Movies/series database foundation.

Future migrations should remain chronological and additive.

Do not create one giant movies.js containing database access, Telegram rendering, provider APIs, and media delivery.

### 27.3 Separation of concerns

The intended dependency direction is:

    Telegram Route
          |
          v
      Movies UI
          |
          v
      Movies Domain
       /              v          v
   Supabase    External Movie APIs

Provider availability should be a separate integration:

    Movies Domain
          |
          v
    Movie Providers

Future authorized media should be separate:

    Movies Domain
          |
          v
    Authorized Media
          |
          v
    Telegram Media Channel

This separation prevents a future media-delivery feature from forcing a rewrite of search, metadata, or Telegram UI.

### 27.4 Telegram interaction conventions

Official Telegram documentation confirms that inline callback data is limited to **1–64 bytes**. Therefore Movies callbacks must use compact identifiers rather than full titles, URLs, or serialized objects.

Preferred pattern:

    movies:home
    movies:search
    movies:type:movie
    movies:type:series
    movies:genre:<short-id>
    movies:page:<page>
    movies:detail:<uuid-or-short-id>:<page>
    movies:favorite:<short-id>
    movies:trailer:<short-id>
    movies:provider:<short-id>
    movies:media:<short-id>

The exact identifiers should be finalized against actual byte lengths before production.

Callback handlers should:

1. Validate callback structure.
2. Answer the callback promptly.
3. Load the referenced record from the database.
4. Verify the record is active/available.
5. Render the next state.
6. Record analytics where appropriate.

Existing FINDLY Jobs already follows the general pattern of dedicated callback handling and same-message navigation; Movies should reuse that pattern.

### 27.5 Same-message navigation

Telegram supports inline keyboards and message editing. FINDLY should use message editing for Movies screens whenever practical.

Target:

    Category
       ↓ edit
    Search / list
       ↓ edit
    Details
       ↓ edit
    Trailer / provider choices
       ↓ edit
    Back

This avoids creating unnecessary message spam and keeps the category feeling like a compact Telegram application.

### 27.6 Deep links

Telegram supports t.me deep links. Movies should use a stable internal identifier rather than a title in the deep-link payload.

Preferred pattern:

    https://t.me/FindlySearch2026Bot?start=movie_<id>

The deep-link handler should resolve the internal ID from the database and then render the title.

Do not encode mutable titles, provider URLs, or large metadata objects in deep links.

### 27.7 Movie data provider strategy

TMDB's current API supports separate search flows for movies and TV, detailed queries, image data, and external-ID lookup. Its documentation also describes search as matching original, translated, and alternative names.

This makes a metadata-provider adapter appropriate:

    src/lib/movie-provider-tmdb.js

rather than scattering TMDB HTTP calls throughout movies.js.

The adapter should own:

- authentication
- endpoint construction
- request handling
- normalization of TMDB responses
- provider-specific identifiers
- rate-limit/error handling

The internal FINDLY catalog should not depend on TMDB response shapes.

### 27.8 Provider availability

TMDB currently exposes watch-provider information through its API, powered by a JustWatch partnership. The official documentation states that provider data is country-specific and requires JustWatch attribution, and that the API does not return full provider deep links; it provides enough information to show availability and a TMDB URL.

Therefore:

- Store provider availability as normalized FINDLY data.
- Store the country/region explicitly.
- Store verification time.
- Do not invent provider links.
- Do not present availability in Morocco based on another country's result.
- Preserve required attribution where applicable.
- Verify current TMDB/JustWatch terms before production use.

### 27.9 Images

TMDB image data uses a configuration-derived base URL/size plus a file path. Image URL construction should therefore live in the provider adapter or a dedicated movie image helper, not be duplicated throughout UI code.

### 27.10 Future Telegram media architecture

Open-source Telegram file-management architectures commonly use a private channel as Telegram-native media storage and keep only metadata/file identifiers in the application database. Telegram's Bot API also supports sending an existing Telegram-hosted video by file_id.

For FINDLY's future **authorized** media phase, the preferred architecture is therefore:

    Authorized source
          |
          v
    FINDLY Media Ingestion
          |
          v
    Private FINDLY Media Channel
          |
          +--> message_id
          +--> file_id
          +--> media metadata
          +--> rights metadata
          |
          v
    Supabase
          |
          v
    User requests media
          |
          v
    Validate rights + availability
          |
          v
    Bot sends Telegram-hosted media

This avoids designing the application around repeated uploads.

However, Telegram's forwarding rules and protected-content behavior must be respected. The exact choice between sendVideo(file_id), copyMessage, or another supported method must be tested against the final channel configuration and media type during the future delivery phase.

### 27.11 Webhook and runtime conventions

The current FINDLY Worker already uses:

- Telegram webhook routes
- Telegram secret-token validation
- Supabase-backed update claiming/idempotency
- waitUntil for webhook processing
- scheduled Cloudflare Worker execution
- native fetch-based Telegram API access

Movies should reuse these runtime conventions.

Do not introduce a second Telegram framework or second webhook receiver only for Movies.

### 27.12 Scheduled synchronization

Movies ingestion should be scheduled through the existing Worker cron architecture.

The scheduled path should not blindly fetch the full catalog every five minutes.

Instead:

    Cron
      ↓
    determine due movie sources
      ↓
    sync source
      ↓
    normalize
      ↓
    deduplicate
      ↓
    upsert
      ↓
    record sync result

The exact interval should be source-specific.

### 27.13 Database conventions

Follow the existing FINDLY migration convention:

    supabase/migrations/
        chronological_timestamp_name.sql

Use UUID primary keys for internal entities unless an external numeric identifier is intentionally retained as a source identifier.

Keep external provider IDs separate:

    id                  = FINDLY internal UUID
    tmdb_id             = external provider ID

Do not use external provider IDs as the primary key of the FINDLY domain.

RLS should be designed before exposing user-owned tables such as favorites and preferences.

### 27.14 Media rights separation

Rights-sensitive fields must not be mixed into the basic title record when they represent a different lifecycle.

Use a separate future media/rights model so that:

    Title
       |
       +--> public metadata
       |
       +--> provider availability
       |
       +--> authorized media assets
                  |
                  +--> rights status
                  +--> rights reference
                  +--> Telegram identifiers
                  +--> verification

This is the main architectural decision intended to prevent a later media-delivery phase from forcing a database rewrite.

### 27.15 Testing order

Before calling a Movies phase complete:

1. Static/syntax validation.
2. Database migration validation.
3. Provider adapter tests with real documented responses or fixtures.
4. Search normalization tests.
5. Deduplication tests.
6. Telegram callback routing tests.
7. Deep-link tests.
8. Same-message navigation tests.
9. Error/fallback tests.
10. Production smoke test with the real FINDLY bot.
11. Only then move to the next phase.

### 27.16 Research references

Primary references used for this architecture:

- Telegram Bot API — inline callback data, media sending, forwarding/copying, webhooks.
- Telegram Deep Links documentation.
- TMDB API — search, details, images, TV, and watch providers.
- Relevant open-source Telegram movie/file projects used only to study architecture patterns, not as a source of unauthorized media.

External implementation details must always be revalidated against the current official API documentation before production code is written.
