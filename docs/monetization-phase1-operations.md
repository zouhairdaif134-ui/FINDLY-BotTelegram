# FINDLY Monetization Phase 1 — Operations and Integration

## Current release boundary

This implementation adds the Owner-controlled Monetization API, Dashboard workspace, database controls, Telegram interaction-triggered ad delivery, and a public read-only website placement configuration endpoint.

The FINDLY-BotTelegram repository contains the Cloudflare Worker, Telegram bot, admin Dashboard, and public social-share HTML pages. The separate `zouhairdaif134-ui/findly-v3-api` repository currently contains only a README and no consumer page implementation. Therefore Home, Search, Movie Details, and Watch placements can be configured and safely read through the public API, but their actual rendering still requires the consumer website frontend to integrate the endpoint and the provider's official tag/SDK. No provider script is accepted from Dashboard input or fabricated by FINDLY.

## Safe provider activation sequence

1. Open **Monetization → Ad Providers**.
2. Configure only the provider's public publisher/domain identifiers. Never enter API secrets or account passwords.
3. Add a provider Zone for the exact channel and format. For Telegram, use the provider-approved Smartlink/zone reference intended for campaign CTA routing; the bot sends a FINDLY-managed text or image card, not a provider JavaScript tag.
4. Test the zone in the provider account and confirm the correct domain, channel, and format.
5. Use **Owner verify**. The backend verifies that the acting administrator actually has the Owner role and records actor, timestamp, and verification method.
6. Enable the verified Zone.
7. Enable the Provider. Disabling a provider pauses its active/scheduled campaigns; disabling a zone pauses campaigns attached to that zone.
8. Create a draft campaign, assign at least one enabled compatible placement, then schedule or activate it.
9. Monitor attempted/sent/failed delivery separately from the revenue ledger. Do not record impressions or sends as money earned.

All provider and placement controls default OFF. Phase 1 does not activate Premium payments or direct advertiser sales.

## Telegram placement triggers

Create a Telegram placement under **Ad Placement Manager** using one of these page keys:

- `all_interactions`: any eligible private bot interaction.
- `start`: after a `/start` interaction.
- `search`: after a `/search` interaction.
- `callback`: after an inline-button callback.
- `message`: after an ordinary text message.

Scheduled campaigns are activated by the Worker cron every five minutes after checking that the provider, verified zone, and at least one enabled compatible placement are ready. Expired active/scheduled campaigns are marked completed.

A campaign is delivered only after the requested bot response succeeds. Group chats, channel posts, known bot identities, excluded users, duplicate Telegram updates, inactive providers/zones, and frequency-limited users do not receive the ad. A failed ad send does not fail or replay the user's original bot update.

Default frequency policy per channel: 3 attempts per user in a rolling 30 days, one per 24-hour conversation window, and a one-hour cooldown. The Owner can change the channel default or set a campaign/placement override in the Dashboard. Failed delivery attempts still consume the safety cap to prevent repeated retries from spamming users.

## Website public placement API

Unauthenticated read-only endpoint:

`GET /api/monetization/public/placements?page=home&slot=home-top&visitor=<random-uuid>&view=<random-uuid>`

The consumer website must configure the same hostname in the provider Zone's `site_domain`. The API checks the request `Origin` (or `Referer` when Origin is absent) against that hostname and its subdomains. The consumer website generates one random `visitor` UUID and persists it in first-party storage, then generates a fresh random `view` UUID for each page view. Do not place email addresses, phone numbers, Telegram IDs, or other personal information in these fields. The Worker hashes the visitor UUID with SHA-256 before storing it and atomically applies the website frequency policy before returning each placement.

Allowed page keys: `home`, `search`, `movie_details`, `watch`, `future`.

The endpoint returns only enabled, in-schedule placements attached to a verified active external provider Zone and an active external campaign. It returns placement/provider identifiers, external zone ID, domain, campaign name, target URL, and configured creative. It does not return secrets or executable HTML/JavaScript.

A consumer website must use its own reviewed provider adapter to load the provider's official code once per page/zone. Until that frontend integration exists and is verified, configured website placements are configuration only and do not constitute proof that ads render on the public website.

## Revenue ledger

- Manual entry: use when recording a verified amount entered by the Owner.
- Provider report: requires a report/statement reference.
- Estimated amounts are rejected as revenue.
- Revenue is grouped by currency, source, and provenance.
- Reversals are new linked debit entries. The original ledger event is immutable.
- Delivery attempts, sends, impressions, and clicks are not automatically converted into revenue.

## Phase 2 gate

The backend computes distinct eligible Telegram MAU from actual activity in the rolling last 30 days. Admin/test exclusions and known bot accounts are excluded. Reaching 1,000 MAU only makes Phase 2 eligible; it does not activate subscriptions, payment collection, or direct advertiser sales. Explicit Owner approval and a separately reviewed Phase 2 implementation are still required.
