---
source: src/infrastructure/http/middlewares/rate-limit.ts
sha256: a3a7d0568838882dce96beae1fbba0ec3768578818c60e00d99f5c42d3da9238
generated_at: 2026-10-29T02:04:08.010001+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/rate-limit.ts

## Purpose

Central rate-limiting machinery for the HTTP layer. Builds all Express rate-limit middleware from a shared `RateLimitBudget` descriptor (the `buildRateLimiter` factory), owns the three budgets no feature module claims (global per-IP brake, API-key credential budget, image-upload budget), and produces the shared refusal response (429 with IETF draft rate-limit headers, audit trail, and metrics) used by every limiter in the app.

## Key elements

- **`buildRateLimiter(budget: RateLimitBudget): RequestHandler`** — Single factory that converts any `RateLimitBudget` into an Express middleware. Configures store, window, limit, key generator, pass-on-error, handler, and header writing. Every module's own `rate-limits.ts` and this file's three budgets go through it.
- **`refuseRateLimited(budget)`** — The 429 handler. Writes `RateLimit-Policy` / `RateLimit` / `Retry-After` headers, records the refusal (metric + optional audit), then delegates to `refuseAntibot` for the shared error envelope.
- **`recordBudgetRefusal(budget, context, metadata)`** — Increments `rateLimitRefusalsTotal` and, if the budget is `audited`, writes an audit event (`SECURITY_RATE_LIMIT_HIT`).
- **`announceBudget(budget, request, response)`** — Appends one entry to `RateLimit-Policy` and `RateLimit` response headers per budget (IETF draft syntax), so stacked limiters all appear.
- **`DEFAULT_RATE_LIMIT_MAX` / `DEFAULT_UPLOAD_RATE_LIMIT_MAX` / `DEFAULT_API_KEY_RATE_LIMIT_MAX`** — Fallback ceilings sourced from `infrastructureRateLimitData`; used when the corresponding env var is unset.
- **`budgetWindowMs` / `budgetLimit` / `infoSlotOf` / `secondsUntil`** — Small resolvers that map a budget's declarative fields (`'shared'` window, per-namespace config variable, `requestPropertyName`) into concrete values the limiter needs.
- **`limiterLogger`** — Redirects express-rate-limit's built-in configuration warnings (e.g. `X-Forwarded-For` without `trust proxy`) to the app logger.
- **`limitReaders`** — `Map<string, configReader>` cache so a budget's env-var reader is defined once per namespace but read at call time.

## Relationships

- **`rate-limit-store.ts`** — Provides `rateLimitStore(namespace, failover, escalation)`; the single Redis-or-memory backing for every limiter built here.
- **`rate-limits.generated.ts`** — Supplies `infrastructureRateLimitData` (default max values for the three infrastructure budgets).
- **`http/config.ts`** — `rateLimitConfig()` resolves `NODE_RATE_LIMIT_WINDOW_MS`; `rateLimitBudgetConfig(namespace)` returns the per-budget config reader used by `budgetLimit`.
- **`antibot-log.ts`** — `refuseAntibot` is called as the final step of every refusal to produce the shared 429 error envelope.
- **`request.ts`** — `callerContextOf(request)` extracts the `CallerContext` needed for audit and metric attribution.
- **`observability/audit.ts` / `audit-actions.generated.ts`** — `recordAudit` and `coreAuditActions.SECURITY_RATE_LIMIT_HIT` are used when a budget's `audited` flag is true.
- **`observability/metrics-rate-limit.ts`** — `rateLimitRefusalsTotal` Prometheus counter, incremented on every refusal.
- **`i18n/index.ts`** — `t('generic.error-rate-limited')` provides the localized error message in the refusal body.
- **`adapters/logger.ts`** — `logger.warn/error` receives express-rate-limit's own configuration diagnostics via `limiterLogger`.
- **`security.ts`** — Mounts the limiters returned by `buildRateLimiter` onto routes (the `installSecurity` step referenced in the file's comments).
- **`scripts/docs/generate-rate-limit-budgets.ts`** — Generates `rate-limits.generated.ts`, which this file imports for default values.
- **`normalize-email.ts`** — Used (in the truncated section) to canonicalize email-based key identifiers for the API-key limiter.

## Notes

- `standardHeaders` and `legacyHeaders` are explicitly **off**; this file writes its own `RateLimit-Policy` / `RateLimit` / `Retry-After` headers via `announceBudget`. The library's built-in writer is avoided because it embeds a `pk` value (a truncated hash of the caller's key) that a shared cache could leak to other visitors.
- `passOnStoreError` defaults to `false` (in-process memory fallback). Only a budget that explicitly sets `onStoreError: 'pass'` lets requests through on store failure. A Redis blip therefore degrades to local counting, not an open door or an auth outage.
- The 429 handler runs **before** the request-context logger (mounted by `installRequestContext`), so `refuseAntibot` is the sole recording point for a refusal — there is no separate access-log entry for a 429.
- `requestPropertyName` is namespaced per budget (`rateLimit:<namespace>` by default) so that when multiple limiters stack on one route, each reads its own `RateLimitInfo` slot without cross-contamination.
- `limitReaders` is a module-level `Map` that is never cleared; budget namespaces are static at boot, so this is safe but means a dynamically added budget would need its reader re-created.
