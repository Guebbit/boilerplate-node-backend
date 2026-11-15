---
source: src/infrastructure/http/config.ts
sha256: df284935b29830b16edeec9d85926464e95c9b0aef1c3a864f7fa82a2c6622ae
generated_at: 2026-11-14T17:59:40.173360+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/config.ts

## Purpose

Declares every deployment-specific setting the HTTP layer needs at runtime: the site's own addresses and CORS origins, the rate-limiter's Redis connection and window, upload size/staging limits, response-cache bounds, idempotency retention, SSE stream caps, and a factory for per-budget rate-limit ceilings. All values are typed, validated, and carry documented defaults so the server can boot without a full environment.

## Key elements

- **`siteConfig`** — `NODE_URL`, `NODE_FRONTEND_URL`, `NODE_CORS_ORIGIN`. The last two are `productionOnly`, meaning the built-in `localhost` defaults fail validation in a production build.
- **`rateLimitConfig`** — `NODE_RATE_LIMIT_WINDOW_MS`, `NODE_RATE_LIMIT_REDIS_URL`, `NODE_RATE_LIMIT_REDIS_PASSWORD`, `NODE_RATE_LIMIT_REDIS_PREFIX`. Redis credentials are marked `sensitive`.
- **`uploadConfig`** — `NODE_MAX_UPLOAD_BYTES`, `NODE_UPLOAD_STAGING_PATH`, `NODE_PENDING_IMAGE_URL`, `NODE_PENDING_THUMBNAIL_URL`. Defaults for max bytes and pending-asset paths come from `sharedDefaults.uploads`.
- **`responseCacheConfig`** — `NODE_REDIS_CACHE_DEV_TTL_MAX`, `NODE_REDIS_CACHE_MAX_BYTES`. Defaults sourced from `sharedDefaults.responseCache`.
- **`idempotencyConfig`** — `NODE_IDEMPOTENCY_RETENTION_HOURS`. Default from `sharedDefaults.idempotency`.
- **`sseConfig`** — `NODE_SSE_MAX_STREAMS_PER_USER` (default 12), `NODE_SSE_MAX_STREAMS` (default 2000). Enforced per-process, independent of the request rate limiter.
- **`rateLimitBudgetConfig(name, budgets)`** — factory that builds a `defineConfig` slice with one `int` field per `RateLimitBudget`, keyed by the budget's `environmentVariable`. Used by app modules to expose their own per-budget ceilings through the same validation pipeline.

## Relationships

- **Imports from `src/infrastructure/config/define.ts`** (`defineConfig`) and **`src/infrastructure/config/fields.ts`** (`csv`, `int`, `text`) to build each config object.
- **Imports `MINUTE_MS` from `src/domain-primitives/time.ts`** as the default rate-limit window.
- **Consumed by `src/infrastructure/http/middlewares/rate-limit.ts`**, **`src/infrastructure/http/middlewares/cache.ts`**, **`src/infrastructure/http/middlewares/idempotency-model.ts`**, **`src/infrastructure/http/middlewares/upload.ts`**, **`src/infrastructure/http/sse.ts`**, **`src/infrastructure/http/origins.ts`**, **`src/infrastructure/http/frontend-link.ts`**, **`src/infrastructure/http/uploads.ts`**, and **`src/infrastructure/adapters/limits-redis.ts`**, which read the exported config objects at module init or request time.
- **`src/modules/account/oauth/config.ts`** and **`src/kernel/module-config.ts`** reference this file for site URLs or to aggregate configs into the kernel.

## Notes

- `NODE_FRONTEND_URL` and `NODE_CORS_ORIGIN` carry `productionOnly: true` on their `required` constraint. The `localhost` defaults exist only to let a developer run locally; the production check reads the raw environment variable, so the default value does **not** satisfy it—deployments must set these explicitly.
- Several defaults are pulled from `@infrastructure/config/defaults.generated` (`sharedDefaults`), a generated file that keeps numeric limits in sync across packages. Do not hard-code those values manually.
- `rateLimitBudgetConfig` is a **factory**, not a static export. Callers pass in their module's budget list (typically from `AppModule.rateLimits` or the `INFRASTRUCTURE_RATE_LIMITS` env var) to produce a per-module config slice.
- SSE caps are enforced per process and are deliberately **not** counted by the request-rate limiter, since a held stream occupies no request slot.
