# FINDLY Movies & Series — Product Definition

**Status:** Product definition / planning baseline  
**Category:** 🎬 الأفلام والمسلسلات  
**Slug:** movies  
**Parent experience:** FINDLY Master Bot  
**Scope:** Movies + TV Series discovery, legal viewing guidance, and future authorized Telegram media delivery  
**Version:** v1.1

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

## 7. Future Authorized Telegram Media Delivery

After the Movies/Series discovery product is complete, FINDLY may add a second delivery layer:

    Bot
      ↓
    FINDLY Media Channel / Private Channel
      ↓
    Authorized Video / File
      ↓
    User

This is a **future product capability** and must be considered in the architecture from the beginning, but it must not be implemented as an unauthorized movie-distribution system.

### Intended model

The future system may use a dedicated Telegram channel as a controlled media storage/distribution layer.

A user could eventually select:

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

The initial database and backend design should leave room for future authorized media delivery without coupling it to the public movie catalog.

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

### Future Media Assets

Separate entity for authorized downloadable/watchable Telegram media.

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

The exact schema must be designed later. Do not create this table until the delivery phase is actually approved and its rights/operational model is defined.

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

### Phase 5 — Monetization

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