# Replica integration — FINDLY BotTelegram

This repository contains the FINDLY Telegram bot and related dashboard/API code. Keep it independent from WASSLHA and BERRECHID IMMO.

## Project facts
- Node.js ES modules and Cloudflare Worker-oriented code; tests use node:test.
- Telegram integration and Supabase are part of the existing system. Inspect current implementation and docs before planning changes.
- The repository's own docs and code are the source of truth; do not infer missing database tables or bot records.

## Non-negotiable boundaries
- Never reuse or connect to WASSLHA or BERRECHID IMMO databases, credentials, storage, workers, or environment variables.
- Do not assume child-bot database records represent real Telegram bots.
- Never deploy a Worker, change a webhook, send Telegram messages, rotate tokens, change secrets, or run production migrations without explicit approval.
- Do not invent movie/content inventory, records, or user activity. Use clearly synthetic fixtures only in tests.
- Preserve existing Telegram update idempotency, webhook behavior, and the project's current API boundaries.
- Before changing code, inspect docs/, package.json, the current bot routes, and current branch. Do not rewrite working flows based on assumptions.
- Use a feature branch and report exact files changed and tests run. Do not merge to main without approval.

## Clean-room and legal
Reimplement observable functionality only. Do not copy third-party source code, proprietary assets, logos, wording, or private APIs. Use original copy and properly licensed assets.
