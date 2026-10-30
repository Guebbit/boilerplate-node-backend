---
source: src/infrastructure/http/config.ts
sha256: 1ad8e3149cbecc2b68e10f441794812e256af53c8851664409ec715414f18c91
generated_at: 2026-10-29T02:00:50.538140+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/config.ts

## Purpose

Declares the typed, validated configuration surface for the HTTP layer of this deployment: site addresses, rate-limit store connection, upload bounds, response-cache limits, and idempotency retention. Each export is a `defineConfig` block (or a factory producing one) that the middleware, adapter, and module layers read at startup.

## Key elements

- **`siteConfig`** – `NODE_URL`, `NODE_FRONTEND_URL`, `NODE_CORS_ORIGIN`. The two URL fields are `required: productionOnly`; the CORS origin is a CSV list.
- **`rateLimitConfig`** – `NODE_RATE_LIMIT_WINDOW_MS`, `NODE_RATE_LIMIT_REDIS_URL`, `NODE_RATE_LIMIT_REDIS_PASSWORD`, `NODE_RATE_LIMIT_REDIS_PREFIX`. The URL and password are marked `sensitive`.
- **`uploadConfig`** – `NODE_MAX_UPLOAD_BYTES`, `NODE_UPLOAD_STAGING_PATH` (defaults to `os.tmpdir()`), plus placeholder asset URLs for pending images/thumbnails.
- **`responseCacheConfig`** – `NODE_REDIS_CACHE_DEV_TTL_MAX`, `NODE_REDIS_CACHE_MAX_BYTES`. Defaults are pulled from `sharedDefaults`.
- **`idempotencyConfig`** – `NODE_IDEMPOTENCY_RETENTION_HOURS` (min 1).
- **`rateLimitBudgetConfig(name, budgets)`** – Factory that takes a `readonly RateLimitBudget[]` and returns a `defineConfig` block with one `int` field per budget's `environmentVariable`, defaulting to `budget.defaultMax`. Used by module-level configs (e.g. OAuth, session) to wire per-route rate-limit caps.

## Relationships

- **Imports** `defineConfig` (`infrastructure/config/define`), field helpers `csv`/`int`/`text` (`infrastructure/config/fields`), and `sharedDefaults` (`infrastructure/config/defaults.generated`).
- **Consumed by** the HTTP middlewares (`rate-limit.ts`, `cache.ts`, `idempotency-model.ts`, `upload.ts`), the Redis adapter (`adapters/limits-redis.ts`), the CORS helper (`origins.ts`), the frontend-link builder (`frontend-link.ts`), and the upload manager (`uploads.ts`).
- **`rateLimitBudgetConfig`** is called from module configs (`modules/account/oauth/config.ts`, `modules/account/session/config.ts`) and the kernel module bootstrap (`kernel/module-config.ts`) to materialise per-budget limits defined in each module's manifest.
- **`app/config.ts`** aggregates or re-exports these blocks for the application-wide config entry point.

## Notes

- `NODE_FRONTEND_URL` and `NODE_CORS_ORIGIN` are `productionOnly: required`. The default (`localhost:8080`) does **not** satisfy the production check because validation reads the raw env variable—leaving it unset in production will fail startup.
- `rateLimitBudgetConfig` is the only *function* export; every other export is a pre-built config object. Callers that need per-route budgets must invoke the factory rather than import a static object.
- Default values for upload and cache sizes come from `sharedDefaults` (a generated file), not hardcoded literals, so they stay in sync with the shared schema.
