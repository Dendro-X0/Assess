# Calibration fixtures

Cached GitHub contexts for golden tests — **no network in CI**.

## Layout

```text
fixtures/calibration/
  labels.seed.csv          # human labels (sync from new-business)
  contexts/*.json          # fetched GitHub context + meta
```

## Refresh fixtures

```bash
# optional: GITHUB_TOKEN in .env for rate limits
pnpm fixtures:fetch
```

Fetch one slug:

```bash
pnpm fixtures:fetch -- --slug=scottcjn-rustchain-bounties-16776
```

Skip existing files:

```bash
pnpm fixtures:fetch:missing
```

## Run golden tests

```bash
pnpm --filter @assess/scoring test src/calibration.test.ts
```

## Pass criteria

| Check | Rule |
|-------|------|
| **Hard pass** | Human `avoid` must **never** get model `proceed` |
| **Soft match** | ≥70% verdict band match (proceed/caution/avoid adjacent OK) |

## Sync labels from planning repo

Copy `new-business/data/calibration/labels.seed.csv` → here when labels grow.
