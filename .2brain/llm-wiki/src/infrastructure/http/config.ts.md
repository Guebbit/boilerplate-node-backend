---
source: src/infrastructure/http/config.ts
sha256: 4073c7e4f4f9e0c3820718b1f3023dd1d11d80551774aa15a626bbf280454c55
generated_at: 2026-10-14T07:52:39.251764+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/config.ts

## Purpose
Central configuration declarations for the HTTP layer. Defines validated, typed settings for site addresses, rate-limiting (including the Redis connection), upload limits, response-cache bounds, and idempotency retention — all using the project's `defineConfig` schema system so every value is defaulted, ranged, and optionally production-gated in one place.

## Key elements
- **`siteConfig`** — `NODE_URL`, `NODE_FRONTEND_URL`, `NODE_CORS_ORIGIN`. The last two are `productionOnly`-required; developers get defaults, deployments must set them explicitly.
- **`rateLimitConfig`** — Shared window (`NODE_RATE_LIMIT_WINDOW_MS`), Redis connection URL/password/prefix. Per-budget limits are *not* here; they come from manifests.
- **`uploadConfig`** — Max bytes, staging directory (defaults to OS `tmpdir`), and placeholder image URLs for pending uploads.
- **`responseCacheConfig`** — Max dev TTL (seconds) and max cached-entry size (bytes).
- **`idempotencyConfig`** — Retention window in hours for the idempotency ledger.
- **`rateLimitBudgetConfig(name, budgets)`** — Factory that produces a per-module budget config from a `RateLimitBudget[]` array. Each budget becomes a single `int` field keyed by its `environmentVariable`. Called at module-registration time (see `src/modules/account/oauth/config.ts` and `src/kernel/module-config.ts`).

## Relationships
- **Imports** `defineConfig` from `@infrastructure/config/define` and field constructors (`text`, `int`, `csv`) from `@infrastructure/config/fields` — these provide the validation/gating primitives.
- **Imports** the `RateLimitBudget` type from `@types` (re-exported via `src/types/index.ts`, sourced in `src/types/rate-limit-budget.ts`) to type the `rateLimitBudgetConfig` factory parameter.
- **Consumed by** the HTTP middlewares: `middlewares/rate-limit.ts` (window, Redis, budgets), `middlewares/cache.ts` (TTL, size), `middlewares/idempotency-model.ts` (retention), `middlewares/upload.ts` (size, staging path).
- **Consumed by** `src/infrastructure/http/origins.ts` (CORS), `src/infrastructure/http/frontend-link.ts` (frontend URL), `src/infrastructure/http/uploads.ts` (staging/limits), and `src/infrastructure/adapters/limits-redis.ts` (Redis connection).
- **Aggregated** by `src/app/config.ts` and `src/kernel/module-config.ts` at application boot.

## Notes
- `NODE_FRONTEND_URL` and `NODE_CORS_ORIGIN` carry `productionOnly: true` on their `required` constraint. The defaults (`localhost`) satisfy development but **do not** satisfy the production check — the validator reads the raw env var, so an unset variable in production will fail even though a default is declared.
- `rateLimitBudgetConfig` is a *factory*, not a singleton. Each call returns a new `defineConfig` instance; call it once per module slice (e.g. `orders-rate-limits`) rather than reusing a single instance.
- Upload staging defaults to `path.join(tmpdir(), 'node-api-uploads')` — on ephemeral containers this is lost on restart; set `NODE_UPLOAD_STAGING_PATH` explicitly if persistence matters.
