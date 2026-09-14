# Signal Desk — Live Dashboard

The real, running version of the [Signal Desk](../README.md) workflow: it scans free, keyless public APIs for the same complaint lexicon from the deck, clusters/scores them with Claude (via OpenRouter), and drafts (never sends) outreach for the top items. Deployed at **https://signal-desk-dashboard.vercel.app**.

## Sources (all free, no auth required)

- GitHub Issues Search API
- Hacker News (Algolia Search API)
- Reddit public search JSON (best-effort — Reddit blocks a lot of unauthenticated traffic; failures here are expected and match the deck's "what didn't work" findings)
- Stack Exchange API (Stack Overflow)
- dev.to API

## Architecture

- `GET /api/scan` — fetches from all sources, clusters/scores with Claude (Prompt A from slide 06), drafts replies for the top items (Prompt B), and persists the result to Vercel Blob. Triggered by Vercel Cron (see `vercel.json`) or manually from the dashboard's "Run scan now" button.
- `GET /api/results` — reads the latest persisted scan result.
- `/` — the dashboard UI: live problem-opportunity matrix + alert feed with drafted replies.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | Calls Claude via OpenRouter for clustering/drafting. Without it, scanning still fetches real items but clustering/drafting steps fail gracefully (visible in the `errors` array). |
| `OPENROUTER_MODEL` | No | Defaults to `anthropic/claude-3.5-sonnet`. |
| `BLOB_READ_WRITE_TOKEN` | Yes (auto-set) | Provisioned automatically when the Vercel Blob store is linked to this project. |
| `GITHUB_TOKEN` | No | Optional personal access token to raise GitHub Search API rate limits. |
| `CRON_SECRET` | No | If set, `/api/scan` requires it (as `Authorization: Bearer <secret>` or `?secret=`) — matches Vercel's recommended cron-security pattern. Leave unset for an open demo endpoint. |

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
