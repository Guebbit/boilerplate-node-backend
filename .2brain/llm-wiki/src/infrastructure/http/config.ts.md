---
source: src/infrastructure/http/config.ts
sha256: ae4628fdfbe54e8f4f83c2ac4a9bf55c2d7bab20bfb024f207dddb7de588f8e8
generated_at: 2026-11-08T03:28:31.163629+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/config.ts

## Purpose

Declares all HTTP-layer configuration objects for a deployment: the site's own and frontend URLs, rate-limiter Redis settings, upload limits and staging, response-cache bounds, and idempotency-ledger retention. Each object is built with the shared `defineConfig` / field helpers so that validation, defaults, and environment-variable binding are uniform across the codebase.

## Key elements

- **`siteConfig`** – `NODE_URL`, `NODE_FRONTEND_URL`, `NODE_CORS_ORIGIN`. The only config here with `productionOnly` required checks; `NODE_FRONTEND_URL` is mandatory in production because every user-facing link (reset, verify, OAuth landing) depends on it.
- **`rateLimitConfig`** – Redis connection (`URL`, `PASSWORD`, `PREFIX`) and the shared `NODE_RATE_LIMIT_WINDOW_MS` (defaults to `MINUTE_MS`).
- **`uploadConfig`** – `NODE_MAX_UPLOAD_BYTES`, `NODE_UPLOAD_STAGING_PATH` (defaults to OS tmpdir), and two placeholder-image URLs.
- **`responseCacheConfig`** – `NODE_REDIS_CACHE_DEV_TTL_MAX` and `NODE_REDIS_CACHE_MAX_BYTES`; defaults pulled from `sharedDefaults`.
- **`idempotencyConfig`** – Single field `NODE_IDEMPOTENCY_RETENTION_HOURS`; default from `sharedDefaults`.
- **`rateLimitBudgetConfig(name, budgets)`** – Factory that produces a config object with one `int` field per `RateLimitBudget`, keyed by the budget's `environmentVariable`. Used to generate per-module budget slices without hand-writing each one.

## Relationships

- **`src/infrastructure/config/define.ts`** – Provides `defineConfig`, the builder every export in this file calls.
- **`src/infrastructure/config/fields.ts`** – Provides the `csv`, `int`, and `text` field validators used to declare each shape member.
- **`src/domain-primitives/time.ts`** – Supplies `MINUTE_MS` as the default for the rate-limit window.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** – Consumes `rateLimitConfig` and `rateLimitBudgetConfig` to read the shared window, Redis target, and per-budget caps.
- **`src/infrastructure/adapters/limits-redis.ts`** – Consumes `rateLimitConfig` for the Redis URL, password, and key prefix.
- **`src/infrastructure/http/middlewares/upload.ts` / `src/infrastructure/http/uploads.ts`** – Consume `uploadConfig` for byte limits, staging directory, and placeholder URLs.
- **`src/infrastructure/http/middlewares/cache.ts`** – Consumes `responseCacheConfig` for TTL and size bounds.
- **`src/infrastructure/http/middlewares/idempotency-model.ts`** – Consumes `idempotencyConfig` for ledger retention.
- **`src/infrastructure/http/frontend-link.ts`** – Reads `siteConfig` (`NODE_FRONTEND_URL`) to construct absolute frontend URLs.
- **`src/infrastructure/http/origins.ts`** – Reads `siteConfig` (`NODE_CORS_ORIGIN`) to build the allowed-origins list.
- **`src/modules/account/oauth/config.ts` / `src/modules/account/session/config.ts`** – Read `siteConfig` (`NODE_FRONTEND_URL`) for OAuth redirect and session links.
- **`src/kernel/module-config.ts`** – Calls `rateLimitBudgetConfig` with per-module budget arrays to materialize typed rate-limit slices.
- **`src/app/config.ts`** – Aggregates or re-exports the top-level config objects for application bootstrap.

## Notes

- `NODE_FRONTEND_URL` and `NODE_CORS_ORIGIN` carry `productionOnly: true` on their `required` check: the check inspects the raw environment variable, so the developer-friendly defaults do **not** satisfy it. In production, omitting these variables will cause startup to fail.
- `sharedDefaults` (from `defaults.generated`) is the source of truth for numeric defaults (upload size, cache bounds, idempotency retention) shared across infrastructure; editing the generated file, not this file, changes those defaults.
- `rateLimitBudgetConfig` is the only *factory* export; everything else is a singleton config object. Callers must invoke it with a distinct `name` per module to avoid collisions.
