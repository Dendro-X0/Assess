# Assess API

Paid-work opportunity risk API — honeypot / farm / unfunded bait scoring for GitHub issues.

**Planning docs:** `../new-business/`  
**Development plan:** [21-assess-development-plan.md](../new-business/docs/21-assess-development-plan.md)

## Stack

- **Hono** on **Cloudflare Workers** + **D1** (production API)
- **Node + SQLite** via `pnpm dev:node` for local testing without Wrangler
- **TypeScript** monorepo (`apps/api`, `apps/docs`, `packages/*`)
- **Polar** (checkout) — webhook scaffold in place (D3)

## Quick start

```bash
pnpm install
cp .env.example .env
# optional: GITHUB_TOKEN=ghp_... for higher rate limits

# API server (Wrangler dev, port 8787)
pnpm dev

# Or Node + SQLite without Wrangler
pnpm dev:node

# Docs landing (port 5173) — in another terminal
pnpm dev:docs
```

Or both together:

```bash
pnpm dev:all
```

If signup fails with “API not running”, stop old servers on port 8787 and restart `pnpm dev:all`. After Node upgrades, run `pnpm install` to rebuild `better-sqlite3`.

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

Create a pro-tier key (for local quota testing):

```bash
pnpm --filter @assess/api db:seed-pro-key
```

Assess locally without the API server (uses cached fixture when available):

```bash
pnpm assess-local "https://github.com/Scottcjn/rustchain-bounties/issues/16776"
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
- `POST /v1/keys` — public free-tier signup (rate limited per IP)
- `POST /v1/assess` — `opportunity` mode only
- `POST /v1/webhooks/polar` — Polar subscription webhooks (Pro upgrade/downgrade)
- Core eight signals: AF-01, 02, 04, 05, 06, 07, 11, 12 (+ AF-03/08/09/10 stubs)
- Free-tier quota (20/mo, 10 req/min per key; dev key bypasses DB usage + rate limits)
- Pro-tier quota (500/mo, 60 req/min) via Polar webhook or `db:seed-pro-key`

## Not yet implemented

- Polar checkout product setup + live checkout link (D3)
- Deployed production API (Workers + D1) — see [DEPLOY.md](./DEPLOY.md)
- Deployed production docs (local `apps/docs` ships)
- Actor mode, batch, webhooks

## Scripts

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm assess-local <github-issue-url>
pnpm calibration
```

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | no | Default `8787` |
| `GITHUB_TOKEN` | recommended | GitHub PAT for server fetches |
| `DATABASE_URL` | no | SQLite path, default `./data/assess.db` |
| `API_KEY_PEPPER` | prod | Pepper for hashing stored keys |
| `DEV_API_KEY` | dev | Bearer token accepted without DB row |
| `POLAR_WEBHOOK_SECRET` | prod | Standard Webhooks secret for `/v1/webhooks/polar` |
| `POLAR_CHECKOUT_URL` | prod | Polar checkout link for Pro upgrades |
| `CORS_ORIGINS` | no | Comma-separated origins for docs signup (default localhost:5173) |
| `SIGNUP_RATE_PER_HOUR` | no | Max API keys per IP per hour (default `5`) |

## License

Proprietary — planning stage.
