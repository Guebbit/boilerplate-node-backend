---
source: src/infrastructure/http/middlewares/rate-limit.ts
sha256: 93a143c0d065b5e77d9d0cb71e9cb54ec3e93c26817749674b8a2d60bcbe5a01
generated_at: 2026-09-23T17:44:37.378937+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/rate-limit.ts

## Purpose

Shared rate-limiting machinery: a single factory (`buildRateLimiter`) that turns any `RateLimitBudget` into an Express middleware, plus the three budgets no individual module owns — the global browsing brake, the API-key credential budget, and the shared image-upload budget. Every module's own `rate-limits.ts` budget also goes through this factory, so store selection, header format, error envelope, and fail-open semantics are defined in exactly one place.

## Key elements

- **`buildRateLimiter(budget)`** — The sole factory. Configures `express-rate-limit` with the shared `rateLimitStore`, `draft-7` headers, `passOnStoreError: true`, and a custom 429 handler. Every limiter in the codebase is produced here.
- **`rateLimiter`** — Global burst brake (address-keyed, 100 req/window default). Mounted app-wide in `app/security.ts`.
- **`apiKeyLimiter`** — Credential-keyed budget (120 req/window default) for requests authenticated via an API key. Invoked from `getAuth`'s credential branch.
- **`uploadLimiter`** — Shared image-upload budget (20 uploads/address/window). Reused by `account`, `products`, and `users` routes.
- **`DEFAULT_RATE_LIMIT_WINDOW_MS` / `_MAX` / `DEFAULT_UPLOAD_RATE_LIMIT_MAX` / `DEFAULT_API_KEY_RATE_LIMIT_MAX`** — Fallback constants read via `environmentNumber` when the corresponding `NODE_*` env var is unset.
- **`identityOf`** — Extracts `email` or `username` from the body, normalises (trim + lowercase), and SHA-256-hashes it so the Redis key never stores a readable identifier. Shared by every module's identity-keyed budget.
- **`addressBlockOf`** — Widens the caller IP to an IPv4 /24 or IPv6 /64 to defeat residential-proxy pools and /48 allocations.
- **`accountIdOf`** — `keyGenerator` that reads `request.authContext!.id` for account-keyed budgets.
- **`readBodyField`** — Safe one-field string extraction from `request.body`; the single place that shape-check exists for body-derived keys.
- **`rateLimitInfoOf`** — Reads the budget's `RateLimitInfo` off the request under its chosen `requestPropertyName`; returns `undefined` if the limiter never ran or the store erred.
- **`KEYED_BY_*` constants** — Human-readable labels consumed by the docs generator to render the budgets table.

## Relationships

- **`rate-limit-store.ts`** — Supplies `rateLimitStore`, the Redis-or-memory backing store injected into every limiter.
- **`src/app/security.ts`** — Mounts `rateLimiter` globally (before per-route limiters).
- **`src/kernel/middlewares/authorizations.ts`** — `getAuth`'s credential branch invokes `apiKeyLimiter` directly; also provides `authContext` that `accountIdOf` reads.
- **`antibot-log.ts`** — `refuseAntibot` is called by the internal `refuse` handler to emit the 429 envelope and log the event.
- **`request.ts`** — Provides `callerContextOf` used when recording an audit entry on refusal.
- **`i18n/index.ts`** — `t()` localises the `RATE_LIMITED` error message in the 429 body.
- **`observability/audit.ts`** — `recordAudit` + `coreAuditActions.SECURITY_RATE_LIMIT_HIT` for opt-in per-budget audit logging.
- **`runtime/environment.ts`** — `environmentNumber` reads `NODE_RATE_LIMIT_MAX`, `NODE_API_KEY_RATE_LIMIT_MAX`, `NODE_RATE_LIMIT_WINDOW_MS`, etc.
- **`src/modules/account/rate-limits.ts`** / **`src/modules/feedback/rate-limits.ts`** — Define module-owned `RateLimitBudget` objects and build their limiters via `buildRateLimiter`; reuse `identityOf`, `addressBlockOf`, `accountIdOf`.
- **`scripts/docs/generate-rate-limit-budgets.ts`** — Imports budget metadata (name, `keyedBy`, `bounds`, env var) to render the table in `docs/tools/security.md`.
- **Test suites** (`modules/account/tests/...`, `modules/feedback/tests/...`) — Exercise the module budgets built through this factory.

## Notes

- **Fail-open, never fail-closed.** `passOnStoreError: true` means a Redis outage lets requests through rather than returning 500. The outage is logged at `error` level once per window.
- **Audit is opt-in per budget.** Credential-keyed budgets (`apiKeyLimiter`) record every 429 via `recordAudit`; the global brake does not (a port scan would drown the signal in noise).
- **429 is emitted before the request logger.** `installSecurity` mounts limiters before `installRequestContext` mounts the logger, so without explicit audit a 429 would leave no trace at all.
- **`skipSuccessfulRequests` is deliberately off for the upload budget** — the expensive case is a _well-formed_ upload (image digest pipeline), not a rejected one.
- **IPv4 /24 masking is hand-rolled** (no library equivalent); IPv6 /64 reuses `express-rate-limit`'s internal `ipKeyGenerator`.
- **`identityOf` hashes with SHA-256** so a `KEYS *` scan or RDB dump does not expose the user's email/username.
- **Test suites raise the window tenfold** (see `tests/support/setup.ts`) to avoid flaky timing in CI.
