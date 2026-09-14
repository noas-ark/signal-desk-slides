# Signal Desk — Live Dashboard

The real, running version of the [Signal Desk](../README.md) workflow: it scans free, keyless public APIs for the same complaint lexicon from the deck, clusters/scores them with Claude (via OpenRouter), and drafts (never sends) outreach for the top items. Deployed at **https://signal-desk-dashboard.vercel.app**.

## Sources (all free, no auth required)

- GitHub Issues Search API — scoped to a curated allowlist of real, well-known open-source AI coding tool repos (`anthropics/claude-code`, `cline/cline`, `continuedev/continue`, `All-Hands-AI/OpenHands`, `block/goose`, `Aider-AI/aider`). Cursor/Copilot/Windsurf are closed-source with no public issue tracker. Unscoped keyword search across all of GitHub was tried first and returned mostly noise — unrelated repos whose own internal code happened to match a search term — so it's intentionally restricted rather than filtered after the fact.
- Hacker News (Algolia Search API)
- Reddit public search JSON (best-effort — Reddit blocks a lot of unauthenticated traffic; failures here are expected and match the deck's "what didn't work" findings)
- Stack Exchange API (Stack Overflow)
- dev.to API
- Substack — no cross-publication search API exists, so this pulls a curated list of AI-tooling newsletter RSS feeds (every Substack exposes one at `/feed`)
- Discourse forums — many dev-tool communities (e.g. `forum.cursor.com`, `community.openai.com`) run on Discourse, which exposes a free public `/search.json?q=` endpoint with no auth needed

Evaluated but intentionally not wired live: **X/Twitter** (no free API access), **G2/Trustpilot/Capterra** (no free API, ToS-restricted scraping), **IndieHackers** (no API), **Discord** (would require joining communities as a bot with permission, not a scraper) — same findings as slide 09's "what didn't work."

## Architecture

- `GET /api/scan` — fetches from all sources, clusters/scores with Claude (Prompt A from slide 06), drafts replies for the top items (Prompt B), posts a ranked digest to Slack + Discord (slide 04 step 03, both optional), and persists the result to Vercel Blob. Triggered by Vercel Cron (see `vercel.json`) or manually from the dashboard's "Run scan now" button.
- `GET /api/results` — reads the latest persisted scan result.
- `POST /api/notify-discord` — re-sends the current (already-scanned) results to Discord without re-running the scan. Used by the dashboard's "Send to Discord" button.
- `/` — the dashboard UI: live problem-opportunity matrix, "Explore a problem area" on-demand search, and alert feed with drafted replies.

## Cluster quality

Two safeguards keep clusters from being noise:
1. **Minimum 3 items per cluster.** Prompt A is instructed not to report a single occurrence as a trend, and `clusterAndScore` filters out any cluster the model returns anyway with fewer than 3 items, as a backstop.
2. **Named-product requirement.** Every item must explicitly name a widely-known AI product in its own text to be included — otherwise the model tended to launder internal bugs from unrelated repos (e.g. a project's own class names) into vague "AI agent" clusters. When in doubt, Prompt A is told to exclude rather than guess.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | Calls Claude via OpenRouter for clustering/drafting. Without it, scanning still fetches real items but clustering/drafting steps fail gracefully (visible in the `errors` array). |
| `OPENROUTER_MODEL` | No | Defaults to `anthropic/claude-sonnet-4.5`. OpenRouter model slugs change over time — check `https://openrouter.ai/api/v1/models` if you see a 404. |
| `BLOB_READ_WRITE_TOKEN` | Yes (auto-set) | Provisioned automatically when the Vercel Blob store is linked to this project. |
| `GITHUB_TOKEN` | No | Optional personal access token to raise GitHub Search API rate limits. |
| `CRON_SECRET` | No | If set, `/api/scan` requires it (as `Authorization: Bearer <secret>` or `?secret=`) — matches Vercel's recommended cron-security pattern. Leave unset for an open demo endpoint. |
| `SLACK_WEBHOOK_URL` | No | Slide 04's "Notify team" step — if set, each scan posts a ranked digest to this [Slack incoming webhook](https://api.slack.com/messaging/webhooks). Omit to skip notification (scan still works). |
| `DISCORD_WEBHOOK_URL` | No | Same "Notify team" step, for Discord instead — a channel's Integrations → Webhooks → New Webhook URL. Independent of Slack; set either, both, or neither. |

Set secrets yourself — never paste them to an assistant:

```bash
vercel env add OPENROUTER_API_KEY production
```

## Local development

```bash
npm install
npm run dev
```

`/api/results` will return an empty state until `/api/scan` has run at least once (locally, this needs `BLOB_READ_WRITE_TOKEN` — run `vercel env pull` after linking the project).
