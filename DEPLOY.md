# Deploy — Assess API

## Quick start (Orbit)

Recommended path — one portal for Cloudflare API + Vercel docs:

```bash
cd assess-api
orbit doctor
orbit login cloudflare
orbit login vercel
orbit configure --all
orbit deploy
orbit status
```

Orbit auto-wires `VITE_API_URL` on Vercel after the Workers deploy. Local state lives in `.orbit/` (gitignored).

If deploy fails: `orbit logs --failed` then `orbit retry`.

Manual provider steps below remain valid for debugging or CI.

---

## Architecture

| Component | Platform | Why |
|-----------|----------|-----|
| **Docs** (`apps/docs`) | Vercel | Static Vite site |
| **API** (`apps/api`) | Cloudflare Workers + D1 | Edge API, managed SQLite (keys/quota) |

---

## 1. API — Cloudflare Workers + D1

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`pnpm --filter @assess/api exec wrangler login`)

### First-time setup

```bash
cd assess-api/apps/api

# Create D1 database (once)
pnpm exec wrangler d1 create assess-db
# Copy database_id from output into wrangler.toml → [[d1_databases]].database_id

# Apply schema
pnpm db:migrate:local   # local dev
pnpm db:migrate:remote  # production

# Set secrets
pnpm exec wrangler secret put API_KEY_PEPPER   # openssl rand -hex 32
pnpm exec wrangler secret put GITHUB_TOKEN     # optional but recommended
pnpm exec wrangler secret put POLAR_WEBHOOK_SECRET  # optional
pnpm exec wrangler secret put POLAR_CHECKOUT_URL    # optional

# Deploy
pnpm deploy
```

API URL: `https://assess-api.<your-subdomain>.workers.dev`

Update `wrangler.toml` `[vars]` `CORS_ORIGINS` to include your docs URL before or after deploy:

```toml
CORS_ORIGINS = "https://YOUR-DOCS.vercel.app,http://localhost:5173"
```

### Health check

```bash
curl https://assess-api.<your-subdomain>.workers.dev/v1/health
```

### Local dev (Workers runtime)

```bash
cd assess-api
cp apps/api/.dev.vars.example apps/api/.dev.vars
# Edit .dev.vars with API_KEY_PEPPER and optional GITHUB_TOKEN

pnpm dev          # wrangler dev on :8787
pnpm dev:node     # Node + SQLite (no wrangler)
pnpm dev:all      # API + docs
```

---

## 2. Docs — Vercel

### Environment variables (Vercel project → Settings → Environment)

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://assess-api.<your-subdomain>.workers.dev` |

### Deploy via GitHub

1. Import repo `Dendro-X0/Assess` on Vercel
2. Set **Root Directory** to `apps/docs`
3. Framework: Vite (auto-detected)
4. Add `VITE_API_URL` env var
5. Deploy

### Deploy via CLI

```bash
cd assess-api/apps/docs
npx vercel deploy -y
```

---

## 3. Post-deploy checklist

- [ ] `curl $API/v1/health` → `{"ok":true}`
- [ ] Docs signup creates a key
- [ ] Try-it assess returns verdict
- [ ] `CORS_ORIGINS` includes docs URL in `wrangler.toml` or dashboard
- [ ] `API_KEY_PEPPER` set via `wrangler secret put` (not default)
- [ ] D1 migrations applied remotely (`pnpm db:migrate:remote`)
- [ ] Optional: Polar webhook URL → `$API/v1/webhooks/polar`

---

## Data files

Allowlist/denylist for Workers are bundled from `apps/api/src/data/`. After editing repo-root `data/*.txt`, copy into `apps/api/src/data/` before deploy.
