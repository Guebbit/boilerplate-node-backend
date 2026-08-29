# src/infrastructure/http/middlewares/security.ts

## Purpose

Defines the application's transport-level security middleware: a global per-address rate limiter, a pair of credential-budget limiters for auth routes, and a static bearer-token guard for the Prometheus scrape endpoint. It exists so that brute-force, credential-stuffing, and unauthorized-metrics-scraping threats are blocked at the HTTP edge before they reach route logic.

## Key elements

- **`rateLimiter`** – Global `express-rate-limit` instance (per-address). Mounted once in `app/security.ts` so unmatched routes are also throttled. Does **not** emit audit events (to avoid port-scan noise).
- **`credentialLimiters`** – Array of two independent `express-rate-limit` instances applied together on auth routes:
  - *Identity limiter*: budgets failed attempts per (normalised, SHA-256-hashed) account name. Emits a `SECURITY_RATE_LIMIT_HIT` audit event.
  - *Address limiter*: budgets failed attempts per source IP. Also audited.
  - Both use `skipSuccessfulRequests: true` so only failures spend the budget.
- **`isMetricsScraper`** – Middleware for the `/observability/metrics` route. Validates a `Bearer` token against `NODE_METRICS_TOKEN` using `timingSafeEqual`. Returns **503** (deny) if the env var is unset, **401** on mismatch.
- **`DEFAULT_RATE_LIMIT_WINDOW_MS` / `DEFAULT_RATE_LIMIT_MAX`** – 60 s / 100 req fallbacks when `NODE_RATE_LIMIT_*` env vars are absent.
- **`DEFAULT_AUTH_RATE_LIMIT_MAX` / `DEFAULT_AUTH_RATE_LIMIT_ADDRESS_MAX`** – 10 / 30 fallbacks for the credential budgets.
- **`identityOf`** (internal) – Extracts `email` or `username` from the request body, normalises (trim + lowercase), and SHA-256-hashes it for use as a Redis key; falls back to `'anonymous'`.
- **`refuse` / `limiterOptions`** (internal) – Shared factory that builds the 429 response via `rejectResponse` + i18n message, and supplies common `rateLimit` options (`passOnStoreError: true`, `draft-7` headers, no legacy headers).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/app/security.ts` | Mounts `rateLimiter` globally on the Express app. |
| `src/infrastructure/http/middlewares/rate-limit-store.ts` | Supplies the `Store` instances (`'global'`, `'credentials-identity'`, `'credentials-address'`). |
| `src/infrastructure/http/response.ts` | Provides `rejectResponse` for all 429 / 503 / 401 replies. |
| `src/infrastructure/http/request.ts` | Provides `callerContextOf`, used to build audit events on rate-limit refusals. |
| `src/infrastructure/i18n/index.ts` | Provides `t()` for the localised `RATE_LIMITED` message. |
| `src/infrastructure/observability/audit.ts` | Provides `emitAuditEvent`, `buildAuditEvent`, `coreAuditActions.SECURITY_RATE_LIMIT_HIT`. |
| `src/infrastructure/runtime/environment.ts` | Provides `environmentNumber` to read `NODE_RATE_LIMIT_*` / `NODE_AUTH_RATE_LIMIT_*` env vars. |
| `src/infrastructure/adapters/logger.ts` | Logs a `warn` when `NODE_METRICS_TOKEN` is unset (503 path). |
| `src/modules/account/routes.ts` | Consumes `credentialLimiters` on login / token-minting routes. |
| `src/modules/observability/routes.ts` | Consumes `isMetricsScraper` on the `/observability/metrics` route. |
| `tests/unit/…/security.test.ts` | Unit-covers each export in isolation. |
| `tests/integration/auth-hardening.test.ts` | Integration-tests the limiter pair and metrics guard end-to-end. |

## Notes

- **Fail-open on store error.** `passOnStoreError: true` is deliberate: a Redis blip must not turn into an authentication outage. The store logs the failure at `error` level so it is never silent.
- **Two limiters, not a pair key.** Keying on `email|ip` would let an attacker vary either half to get a fresh bucket. Two independent stores close both the botnet-spread hole and the single-host-spray hole at the cost of one extra round-trip.
- **`credentialLimiters` is an array on purpose.** Express flattens array middleware, so a route that writes `router.post('/login', credentialLimiters, handler)` cannot accidentally apply only one of the two.
- **`timingSafeEqual` length guard.** A direct call throws on length mismatch (a length oracle). The code compares `Buffer.length` first and folds both into a single boolean.
- **Metrics auth is deny-by-default.** If `NODE_METRICS_TOKEN` is unset the endpoint returns 503 unconditionally; there is no "open in dev" fallback.
- **Tests raise limits tenfold** (see `tests/support/setup.ts` referenced in the docblock) so integration suites don't trip the production budgets.
