---
source: src/infrastructure/http/config.ts
source_sha256: 808f063f651ac4b96ff0efe166af736fbd3c20dbb4d63fb145379a0d03dc5390
context_sha256: d227fbb30a5dce6656c9728500b4217ff134cab7f3ff8f85e56a980f9e653f6a
generated_at: 2026-11-22T02:47:17.240352+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/config.ts

## Purpose
Declares the HTTP layer's environment-driven configuration as a set of named config slices built with `defineConfig`. These cover this deployment's own addresses, the rate limiter's store, upload limits, the response cache's bounds, the idempotency ledger's retention and SSE stream caps. It also provides a factory that turns rate-limit budgets into a config slice.

## Key elements
- `siteConfig` (`site`): `NODE_URL`, `NODE_FRONTEND_URL` and `NODE_CORS_ORIGIN`. The frontend URL and CORS origin default to localhost values but are required (`productionOnly`) in a deployment.
- `rateLimitConfig` (`rate-limit`): `NODE_RATE_LIMIT_WINDOW_MS` (default `MINUTE_MS`, min 1) and the `limits` Redis settings (`NODE_RATE_LIMIT_REDIS_URL`, `NODE_RATE_LIMIT_REDIS_PASSWORD`, both `sensitive`, and `NODE_RATE_LIMIT_REDIS_PREFIX`, default `rate-limit`).
- `uploadConfig` (`uploads`): `NODE_MAX_UPLOAD_BYTES`, `NODE_UPLOAD_STAGING_PATH` (default under the OS temp dir, `node-api-uploads`), and the pending image and thumbnail URLs.
- `responseCacheConfig` (`response-cache`): `NODE_REDIS_CACHE_DEV_TTL_MAX` (min 0) and `NODE_REDIS_CACHE_MAX_BYTES`.
- `idempotencyConfig` (`idempotency`): `NODE_IDEMPOTENCY_RETENTION_HOURS`.
- `sseConfig` (`sse`): `NODE_SSE_MAX_STREAMS_PER_USER` (default 12) and `NODE_SSE_MAX_STREAMS` (default 2000), counted per process.
- `rateLimitBudgetConfig(name, budgets)`: builds a config slice from `RateLimitBudget[]`. Each budget becomes an `int` field keyed by `budget.environmentVariable`, with `defaultMax` as the default and min 1.

## Relationships
- Uses `defineConfig` from `src/infrastructure/config/define.ts` and the `csv`, `int` and `text` field builders from `src/infrastructure/config/fields.ts`.
- Imports `MINUTE_MS` from `src/domain-primitives/time.ts`.
- The neighbor files (`origins.ts`, `frontend-link.ts`, `sse.ts`, `uploads.ts`, and the cache, idempotency, rate-limit and upload middlewares, plus `limits-redis.ts`) are the HTTP and adapter code these settings are for. The neighbor list marks them as related, but this file's content does not show how they consume the exports.
- `src/app/config.ts`, `src/kernel/module-config.ts` and `src/modules/account/oauth/config.ts` sit alongside it in the config graph. `rateLimitBudgetConfig` is meant for slices of rate-limit budgets whose data lives on a module manifest or in `INFRASTRUCTURE_RATE_LIMITS`.

## Notes
- The `NODE_FRONTEND_URL` production check reads the raw variable, so its localhost default does not satisfy `required`. Unset in a deployment, reset, verify, delete and email-change links and the OAuth landing page would point at `localhost`.
- Per-budget rate limits are not declared here. They come from manifests or `INFRASTRUCTURE_RATE_LIMITS`, and this file only gives them the typed, validated shape.
- SSE caps exist because a held stream is never counted by the request limiter.
- Several defaults, such as upload max bytes, cache TTL and size and idempotency retention, come from a generated `sharedDefaults` module rather than literals in this file.
