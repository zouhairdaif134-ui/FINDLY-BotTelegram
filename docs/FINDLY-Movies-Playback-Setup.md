# FINDLY Movies — authorized Telegram playback setup

This guide describes the intended rollout for the catalog-to-video flow added in PR #3. It does not apply migrations, configure Cloudflare secrets, or deploy anything.

## 1. Database

Review and apply `supabase/migrations/20261103000100_movies_authorized_media.sql` to the intended Supabase environment. It creates `movie_media_assets`, separate from public movie metadata. The table is protected by RLS and grants no access to `anon` or `authenticated`; the Worker service role performs reads and writes.

Do not apply this migration to Production until the owner explicitly approves the production change.

## 2. Worker configuration

Configure `TELEGRAM_MOVIES_ADMIN_IDS` as a Cloudflare Worker secret. Its value is a comma-separated allowlist of numeric Telegram user IDs, for example `123456789,987654321`. Do not put bot tokens or admin IDs in source control.

The Movies Bot must already have its own `TELEGRAM_MOVIES_BOT_TOKEN` and its webhook configured at `/telegram/movies`.

## 3. Add a video to a movie

1. Create/import the movie in Dashboard and note its UUID.
2. From an account in `TELEGRAM_MOVIES_ADMIN_IDS`, open the Movies Bot.
3. Send the video as a Telegram video message with this caption:

   `/attachmovie <movie_uuid> <rights_reference>`

4. The bot stores its own Telegram `file_id` in `movie_media_assets` with `rights_status=pending`. This prevents accidental public delivery.
5. In Dashboard, edit that movie. Review the rights evidence and set **Rights verification** to **Authorized for distribution**. Keep **Delivery enabled** checked. Save.
6. Publish the movie (status `active`) if it is not already active.

The `file_id` is obtained by the Movies Bot itself. Telegram file IDs are bot-scoped; a file ID collected by another bot must not be assumed to work with Movies Bot.

## 4. User flow

- Master Bot reads active movie records from the shared Supabase catalog and displays poster, title, synopsis, year, genre and rating when available.
- The watch button opens Movies Bot with `/start movie_<movie_uuid>`.
- Movies Bot resolves the same UUID and sends the corresponding video using Telegram `sendVideo`.
- If the movie is inactive, no asset exists, the asset is disabled, or rights are not authorized, the bot blocks delivery and explains that playback is unavailable.

## 5. Required live verification

After the migration and secret are configured in a non-production environment first, test:
- Admin allowlist accepts an authorized sender and rejects other users.
- Upload stores a pending asset and does not deliver it.
- Dashboard authorization persists.
- Master card displays the correct metadata and deep link.
- Movies Bot sends the exact video for the UUID.
- Revoking rights or disabling the asset blocks subsequent delivery.

The code change and CI checks do not by themselves prove a live Telegram end-to-end test.
