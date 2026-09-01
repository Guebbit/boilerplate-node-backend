# src/infrastructure/http/middlewares/rate-limit.ts

## Purpose

Defines three HTTP rate-limiting mechanisms — a global per-address burst brake and a pair of tighter per-credential budgets — plus a bearer-token guard for the Prometheus scrape endpoint. All limiters share one Redis-or-memory store, fail open on store errors, and respond through the project's standard error envelope rather than `express-rate-limit`'s plain-text body.

## Key elements

- **`rateLimiter`** (`RequestHandler`) — Global limiter applied across the entire surface. Keyed by IP. Does **not** emit audit events on refusal (avoids burying the trail in port-scan noise).
- **`credentialLimiters`** (`RequestHandler[]`) — Array of two independent limiters for routes that accept credentials. Because it is an array, Express mounts both together; a route cannot apply only one.
  - *Identity limiter* — keyed by a SHA-256 hash of the normalised `email`/`username` from the request body (falls back to `"anonymous"`). Only failures spend budget (`skipSuccessfulRequests`). **Does** emit audit events.
  - *Address limiter* — keyed by IP. Also failure-only, audit-on.
- **`isMetricsScraper`** (`NextFunction` guard) — Static bearer-token check for the `/observability/metrics` route. Denies with 503 when `NODE_METRICS_TOKEN` is unset; 401 on mismatch. Uses `timingSafeEqual` with a length pre-check to avoid a timing/length oracle.
- **`DEFAULT_RATE_LIMIT_WINDOW_MS`** (60 000), **`DEFAULT_RATE_LIMIT_MAX`** (100), **`DEFAULT_AUTH_RATE_LIMIT_MAX`** (10), **`DEFAULT_AUTH_RATE_LIMIT_ADDRESS_MAX`** (30) — Fallback constants; each overridable via the corresponding `NODE_*` env var.
- **`refuse(audit)`** — Internal factory returning the 429 handler. Emits `SECURITY_RATE_LIMIT_HIT` audit event only when `audit` is true.
- **`limiterOptions(store, audit)`** — Internal factory for shared `express-rate-limit` options (`standardHeaders: 'draft-7'`, `legacyHeaders: false`, `passOnStoreError: true`).

## Relationships

- **`src/app/security.ts`** — Mounts `rateLimiter` globally (before routing), so unmounted paths are also counted.
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — Supplies the shared `rateLimitStore` (Redis or in-memory) consumed by every limiter.
- **`src/infrastructure/http/response.ts`** — `rejectResponse` formats all 429/401/503 bodies.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts caller identity for audit events.
- **`src/infrastructure/observability/audit.ts`** — `emitAuditEvent`, `buildAuditEvent`, `coreAuditActions` for credential-refusal audit trail.
- **`src/infrastructure/i18n/index.ts`** — `t('generic.error-rate-limited')` localises the 429 message.
- **`src/infrastructure/runtime/environment.ts`** — `environmentNumber` reads `NODE_RATE_LIMIT_*` / `NODE_AUTH_RATE_LIMIT_*` env vars.
- **`src/infrastructure/adapters/logger.ts`** — Logs a `warn` when `NODE_METRICS_TOKEN` is unset.
- **`src/modules/account/routes.ts`** — Consumes `credentialLimiters` on sign-in / token-mint endpoints.
- **`src/modules/observability/routes.ts`** — Consumes `isMetricsScraper` on the Prometheus scrape route.
- **`tests/unit/infrastructure/http/middlewares/rate-limit.test.ts`** — Unit tests for limiter construction and `isMetricsScraper`.
- **`tests/integration/auth-hardening.test.ts`** — Integration tests exercising credential-limit budgets.

## Notes

- **Fail-open on store error:** `passOnStoreError: true` lets a Redis blip degrade to unenforced budgets rather than a 500 authentication outage. The failure is logged at `error` level once.
- **`identityOf` hashes the identifier** (SHA-256) before it reaches the store, so a `KEYS *` or RDB dump does not reveal the user list.
- **`timingSafeEqual` length guard:** A raw length mismatch would itself leak the token length, so the code compares lengths first and folds both results into a single boolean.
- **"Bearer " prefix is mandatory** in `isMetricsScraper` — a bare token in the header is treated as absent, preventing a non-standard header shape from becoming a leak vector.
- **`credentialLimiters` is an array, not a single handler,** because Express flattens arrays of middleware; this guarantees a route applies both the identity and address budgets atomically.
- **Audit asymmetry is intentional:** the global brake does *not* audit (a scanner would flood the log), while the credential budgets *do* (a burst of 429s on the identity key is the primary early-warning signal for credential stuffing).
