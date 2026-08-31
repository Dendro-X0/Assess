# Assess API

Paid-work opportunity risk API — honeypot / farm / unfunded bait scoring for GitHub issues.

**Planning docs:** `../new-business/`  
**Development plan:** [21-assess-development-plan.md](../new-business/docs/21-assess-development-plan.md)

## Stack

- **Hono** + Node 20+
- **TypeScript** monorepo (`apps/api`, `packages/*`)
- **SQLite** for API keys + usage metering
- **Polar** (checkout) — planned in D3

## Quick start

```bash
pnpm install
cp .env.example .env
# optional: GITHUB_TOKEN=ghp_... for higher rate limits

pnpm dev
```

Health:

```bash
curl http://localhost:8787/v1/health
```

Assess (dev key from `.env` `DEV_API_KEY`):

```bash
curl -s http://localhost:8787/v1/assess \
  -H "Authorization: Bearer ask_dev_local_only" \
  -H "Content-Type: application/json" \
  -d '{"mode":"opportunity","url":"https://github.com/Scottcjn/rustchain-bounties/issues/16776"}' | jq
```

Create a persisted free-tier key:

```bash
pnpm --filter @assess/api db:seed-dev-key
```

## Packages

| Package | Role |
|---------|------|
| `@assess/github` | URL parse + GitHub REST fetch |
| `@assess/signals` | AF-01…12 MVP eight detectors |
| `@assess/scoring` | Weights → verdict |
| `@assess/api` | HTTP server |

## MVP scope (current)

- `GET /v1/health`
- `POST /v1/assess` — `opportunity` mode only
- Core eight signals: AF-01, 02, 04, 05, 06, 07, 11, 12
- Free-tier quota (20/mo per key; dev key bypasses DB usage)

## Not yet implemented

- Polar Pro billing webhooks (D3)
- Public docs site (D4)
- Actor mode, batch, webhooks
- Rate limit per minute (only monthly quota today)

## Scripts

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | no | Default `8787` |
| `GITHUB_TOKEN` | recommended | GitHub PAT for server fetches |
| `DATABASE_URL` | no | SQLite path, default `./data/assess.db` |
| `API_KEY_PEPPER` | prod | Pepper for hashing stored keys |
| `DEV_API_KEY` | dev | Bearer token accepted without DB row |

## License

Proprietary — planning stage.
