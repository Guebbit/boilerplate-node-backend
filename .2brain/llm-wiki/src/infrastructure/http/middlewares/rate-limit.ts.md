---
source: src/infrastructure/http/middlewares/rate-limit.ts
sha256: cf6560b79bf10bd792cf88189c3cf4aa12ea3cf0368c569ecf975f9e3381b141
generated_at: 2026-10-15T09:50:29.546764+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/rate-limit.ts

## Purpose

Shared rate-limiting factory and the three infrastructure-owned budgets (global per-address brake, api-key credential budget, image-upload budget). Every module that declares its own `RateLimitBudget` calls `buildRateLimiter` here, so all limiters—regardless of which route mounts them—share the same store, response shape, metrics, and audit trail. Also exposes `chargeBudget` for non-Express code paths that need to spend a budget unit programmatically.

## Key elements

- **`buildRateLimiter(budget)`** — Factory. Takes a `RateLimitBudget` descriptor and returns an Express `RequestHandler` built on `express-rate-limit`. Wires in the shared store, window, `draft-7` headers, fail-closed store policy, and the standard 429 handler.
- **`chargeBudget(budget, key)`** — Programmatic charge for service-layer code (e.g. "recipient of a notification"). Returns `{ allowed, retryAfterSeconds }`. Counts in the same store the budget's middleware would use, so one budget = one tally regardless of entry point.
- **`refuseRateLimited(budget)`** — The 429 handler. Increments the `rateLimitRefusalsTotal` metric, optionally records an audit event (for `audited` budgets like credential stuffing), then delegates the response to `refuseAntibot` so the body is always the shared error envelope.
- **`DEFAULT_RATE_LIMIT_MAX` / `DEFAULT_API_KEY_RATE_LIMIT_MAX` / `DEFAULT_UPLOAD_RATE_LIMIT_MAX`** — Fallback limits (100 / 120 / 20) used when the corresponding env variable is unset.
- **`KEYED_BY_*` constants** — Human-readable labels (address, address block, submitted email, authenticated account, challenge) used in the generated security docs table.
- **`accountIdOf(request)`** — `keyGenerator` for account-keyed budgets; reads `request.authContext!.id` (guaranteed present by `isAuth`).
- **`readBodyField(request, field)`** — Safe extraction of a single string field from a JSON body; returns `undefined` on any shape mismatch. Used by keying functions that bucket on submitted values.
- **`limitReaders`** (module-private) — Caches the typed config reader per budget namespace so the limit is read at call time (honouring late env changes) without re-defining a config slice on every call.
- **`chargedStores`** (module-private) — Caches the `Store` instance for hand-charged budgets, initialising `windowMs` once, since no `rateLimit()` instance triggers `store.init` in that path.

## Relationships

- **`rate-limit-store.ts`** — Supplies `rateLimitStore`, the Redis-or-memory backing store. This file passes the namespace, failure policy, and optional escalation config to it.
- **`src/infrastructure/http/config.ts`** — `rateLimitBudgetConfig` provides the env-var-backed limit reader; `rateLimitConfig` supplies the shared `NODE_RATE_LIMIT_WINDOW_MS` when a budget uses `windowMs: 'shared'`.
- **`antibot-log.ts`** — `refuseAntibot` is called by the 429 handler to emit the response (status, error envelope, structured log). This file does not format the body itself.
- **`src/infrastructure/observability/metrics-rate-limit.ts`** — `rateLimitRefusalsTotal` is incremented on every refusal, labelled by budget namespace.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` + `coreAuditActions.SECURITY_RATE_LIMIT_HIT` are called for audited budgets (credential-keyed ones).
- **`src/infrastructure/http/request.ts`** — `callerContextOf` provides the identity metadata for audit records.
- **`src/infrastructure/adapters/logger.ts`** — The app `logger` replaces `express-rate-limit`'s default `console` for internal misconfiguration warnings.
- **`src/infrastructure/i18n/`** — `t` translates the `RATE_LIMITED` error message.
- **`src/infrastructure/persistence/normalize-email.ts` / `src/infrastructure/security/pseudonymise.ts`** — Used by the keying helpers to normalise and pseudonymise email/username buckets before they hit the store.
- **`scripts/docs/generate-rate-limit-budgets.ts`** — Consumes the `KEYED_BY_*` labels and budget descriptors to render the table in `docs/tools/security.md`.

## Notes

- **Fail-closed by default.** `passOnStoreError` is `false` unless a budget explicitly opts into `'pass'`. On a Redis outage, non-pass budgets fall back to in-process memory counting; `pass` budgets let the request through. The choice is per-budget, not global.
- **`skipSuccessfulRequests` defaults to `false`.** Even well-formed uploads (the expensive case) consume the budget, by design for the upload budget.
- **Headers are `draft-7` (`RateLimit-*`).** The deprecated `X-RateLimit-*` set is explicitly disabled.
- **The 429 short-circuits before the request logger.** Because `installSecurity` mounts limiters before `installRequestContext`, the only trace of a global-brake refusal is the `refuseAntibot` call itself—there is no separate access-log line.
- **`windowMs: 'shared'` is a sentinel string**, not a number. It resolves to the global `NODE_RATE_LIMIT_WINDOW_MS` at build time, so all budgets that use it share one window regardless of their own limit.
- **`chargedStores` must outlive a single request.** A budget charged from multiple service paths (e.g. notification fan-out) must hit the same `Store` instance, which is why the cache is module-level rather than per-middleware.
