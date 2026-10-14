---
source: src/infrastructure/http/middlewares/rate-limit.ts
sha256: da43dea215b4da2e8060000a7cb472a7a02697597b067f4d3569d7c65185ccce
generated_at: 2026-10-14T07:58:11.765086+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/rate-limit.ts

## Purpose

Central factory and shared constants for all rate-limit budgets in the codebase. Every module's `rate-limits.ts` budget and the three infrastructure-owned budgets (global burst brake, api-key, image-upload) are built through the single `buildRateLimiter` factory defined here. The file also provides `chargeBudget`, which lets non-Express service code spend a unit of a budget against the same store the middleware uses.

## Key elements

- **`buildRateLimiter(budget)`** — The sole factory that turns a `RateLimitBudget` into an Express `RequestHandler`. Configures store, window, headers (`draft-7`), `passOnStoreError`, handler, and optional `keyGenerator`/`skip`/`requestWasSuccessful`.
- **`refuseRateLimited(budget)`** — The 429 handler. Increments the `rateLimitRefusalsTotal` metric, records an audit event if `budget.audited` is true, and delegates to `refuseAntibot` so the refusal is logged even when it short-circuits before the request logger.
- **`chargeBudget(budget, key)`** — Async helper for service code to spend one unit of a budget outside an Express route. Returns `{ allowed, retryAfterSeconds }`. Uses a per-namespace cached store (`chargedStores`) so a budget charged from multiple call sites counts in one tally.
- **`budgetLimit(budget)`** — Reads the runtime limit from the budget's environment variable (via a cached config reader in `limitReaders`), falling back to the budget's declared default.
- **`DEFAULT_RATE_LIMIT_MAX` (100), `DEFAULT_UPLOAD_RATE_LIMIT_MAX` (20), `DEFAULT_API_KEY_RATE_LIMIT_MAX` (120)** — Default ceilings for the three infrastructure-owned budgets.
- **`KEYED_BY_*` constants** — Human-readable labels for each keying strategy, used by the docs generator to render a consistent column in the budgets table.
- **`accountIdOf(request)`** — Key generator that resolves the authenticated account ID from `request.authContext!.id`.
- **`readBodyField(request, field)`** — Type-safe reader for a single string field off a JSON request body; returns `undefined` when the body or field is absent/wrong-typed.
- **`limiterLogger`** — Redirects express-rate-limit's internal `warn`/`error` to the app logger (catches misconfigurations like `X-Forwarded-For` with `trust proxy` off).

## Relationships

- **`rate-limit-store.ts`** — Provides `rateLimitStore(namespace, onStoreError, escalation?)`, the Redis-or-memory backing store every limiter uses.
- **`src/infrastructure/http/config.ts`** — Source of `rateLimitBudgetConfig` (per-budget env-variable reader) and `rateLimitConfig` (global window size).
- **`src/infrastructure/http/middlewares/antibot-log.ts`** — `refuseAntibot` builds the actual 429 response envelope and writes the security log line.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts identity/route metadata for the audit record on refusal.
- **`src/infrastructure/i18n/index.ts`** — `t()` translates the `generic.error-rate-limited` message in the 429 body.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` + `coreAuditActions.SECURITY_RATE_LIMIT_HIT` for audited budgets.
- **`src/infrastructure/observability/metrics-rate-limit.ts`** — `rateLimitRefusalsTotal` Prometheus counter, labelled by budget namespace.
- **`src/infrastructure/persistence/normalize-email.ts` / `src/infrastructure/security/pseudonymise.ts`** — Used by keying helpers (e.g. submitted-email budgets) to normalise and pseudonymise the key before it hits the store.
- **`src/kernel/middlewares/authorizations.ts`** — Mounts account-keyed budgets (via `accountIdOf`) after `getAuth` has populated `authContext`.
- **`scripts/docs/generate-rate-limit-budgets.ts`** — Reads the `KEYED_BY_*` labels and budget declarations to render the `docs/tools/security.md` budgets table.
- **`src/app/security.ts`** — Orchestrator that installs the three infrastructure-owned limiters and wires `installSecurity` before the request-context middleware.

## Notes

- **Ordering matters:** `installSecurity` (which mounts these limiters) runs *before* `installRequestContext` (which mounts the request logger). The `refuseAntibot` call in `refuseRateLimited` exists specifically so a 429 is still logged even though it short-circuits before any other middleware fires.
- **`passOnStoreError` is opt-in:** Only budgets whose `onStoreError` is `'pass'` let a request through when the store is unreachable. All others fall back to in-process counting so a Redis blip is neither an outage nor an open door.
- **`skipSuccessfulRequests`** defaults to `false`. The upload budget explicitly keeps it off because a *well-formed* upload (the expensive CPU case) must still be counted, unlike a rejected one.
- **`limitReaders` is a module-level `Map` cache:** defining a config slice has a cost, and a budget's limit is read more than once during limiter construction. Readers are created once per namespace and reused.
- **`chargedStores` vs. the middleware's internal store:** A budget charged via `chargeBudget` must use the *same* store instance the middleware uses, or an in-process (memory) store would maintain separate tallies per call site. `chargedStoreOf` guarantees one store per namespace.
- **`standardHeaders: 'draft-7'`** — Emits `RateLimit-*` headers (IETF draft) rather than the deprecated `X-RateLimit-*` set.
