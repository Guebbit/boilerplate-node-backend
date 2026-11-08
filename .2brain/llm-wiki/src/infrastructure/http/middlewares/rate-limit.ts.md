---
source: src/infrastructure/http/middlewares/rate-limit.ts
sha256: a3a7d0568838882dce96beae1fbba0ec3768578818c60e00d99f5c42d3da9238
generated_at: 2026-11-08T03:32:32.037568+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/rate-limit.ts

## Purpose

Shared rate-limiting machinery for the entire HTTP layer. Owns three infrastructure-level budgets (the global per-address brake, the per-credential API-key budget, and the shared image-upload budget) and exports `buildRateLimiter`, the single factory through which every module's own `rate-limits.ts` budget is also constructed. All limiters share one Redis-or-memory backing store and a unified refusal path that emits the app's error envelope, IETF-draft rate-limit headers, metrics, and optional audit records.

## Key elements

- **`DEFAULT_RATE_LIMIT_MAX` / `DEFAULT_UPLOAD_RATE_LIMIT_MAX` / `DEFAULT_API_KEY_RATE_LIMIT_MAX`** — exported defaults read from the generated `rate-limits.generated` module; used when the corresponding environment variable is unset.
- **`recordBudgetRefusal(budget, context, metadata?)`** — increments the `rateLimitRefusalsTotal` metric and, when `budget.audited` is true, writes a `SECURITY_RATE_LIMIT_HIT` audit event. The single choke-point every refusal (limiter or service-charged) flows through.
- **`refuseRateLimited(budget)`** — Express handler invoked on budget exhaustion. Writes `RateLimit` / `RateLimit-Policy` / `Retry-After` headers, records the refusal, and delegates the actual 429 response to `refuseAntibot` (which also handles the anti-bot log and the shared error envelope).
- **`announceBudget(budget, request, response)`** — appends one named entry per passed budget to `RateLimit-Policy` and `RateLimit` headers using the IETF draft-ietf-httpapi-ratelimit-headers syntax. Written by hand because the library's built-in writer would leak a truncated caller-key hash.
- **`buildRateLimiter(budget)`** — the public factory. Wraps `express-rate-limit` with the shared `rateLimitStore`, resolves the window and limit from config, disables the library's own headers, and wires the custom handler and logger. Returns a thin middleware that calls `announceBudget` on the pass-through path.
- **`budgetLimit(budget)` / `budgetWindowMs(budget)` / `infoSlotOf(budget)`** — internal resolvers that turn a `RateLimitBudget` descriptor into a concrete number, window, or request-property slot. `limitReaders` (a `Map`) caches per-namespace config readers so repeated reads during limiter construction do not re-parse the env.
- **`limiterLogger`** — routes `express-rate-limit`'s internal `warn`/`error` (e.g. an untrusted `X-Forwarded-For` with `trust proxy` off) to the app logger instead of `console`.

## Relationships

- **`rate-limit-store.ts`** — provides `rateLimitStore(namespace, onStoreError, escalation?)`, the Redis-or-memory store every limiter in this file (and every module limiter built via `buildRateLimiter`) uses.
- **`antibot-log.ts`** — `refuseAntibot` is called inside `refuseRateLimited` to emit the 429 response, the anti-bot audit log entry, and the shared error-envelope body.
- **`request.ts`** — `callerContextOf(request)` supplies the `CallerContext` needed for `recordBudgetRefusal` and audit records.
- **`config.ts` (http)** — `rateLimitConfig()` supplies `NODE_RATE_LIMIT_WINDOW_MS` for budgets whose `windowMs` is `'shared'`; `rateLimitBudgetConfig(namespace, budgets)` supplies the per-budget limit reader.
- **`metrics-rate-limit.ts`** — `rateLimitRefusalsTotal` is the Prometheus counter incremented on every refusal.
- **`audit.ts`** — `recordAudit` and `coreAuditActions.SECURITY_RATE_LIMIT_HIT` are used when a budget is marked `audited`.
- **`logger.ts`** — `logger.warn` / `logger.error` receive `express-rate-limit`'s deployment-misconfiguration warnings.
- **`i18n/index.ts`** — `t('generic.error-rate-limited')` provides the translated error message in the 429 body.
- **`normalize-email.ts` / `pseudonymise.ts`** — used by the credential-keyed (`apiKeyLimiter`) and possibly other keyed budgets to derive a stable, non-reversible key from an email or API-key identifier.
- **`security.ts` (app)** — the module docblock notes `installSecurity` mounts these limiters *before* `installRequestContext`, meaning a 429 short-circuits before the request logger would otherwise record it; that is why `refuseAntibot` is called directly.
- **`scripts/docs/generate-rate-limit-budgets.ts`** — produces the `rate-limits.generated` module that supplies the `DEFAULT_*` constants and the per-budget descriptors consumed here.
- **`scripts/audit/api-standards.yaml`** — defines the API-standard checks (e.g. presence of rate-limit headers, 429 body shape) that this file's refusal path must satisfy.

## Notes

- **Headers are written by this file, not by `express-rate-limit`.** `standardHeaders` and `legacyHeaders` are both disabled because the library's draft-8 writer emits a `pk` parameter containing a truncated, unsalted hash of the caller's key (an IPv4 address for the global budget), which a shared cache could replay to other visitors.
- **429 responses bypass the request logger.** Because `installSecurity` runs before `installRequestContext`, a short-circuited 429 would leave no trace; `refuseAntibot` is the one call that guarantees a log line.
- **Stacked limiters use namespaced `requestPropertyName` slots** (`rateLimit:<namespace>` by default). Without this, a limiter that skips a request would leave stale `RateLimitInfo` on the request that a later limiter could misread.
- **`passOnStoreError` is `false` by default.** On a Redis outage the store falls back to in-process counting (`failoverStore` in `rate-limit-store.ts`), so a blip is neither an auth outage nor an open door. Only budgets explicitly set to `onStoreError: 'pass'` let requests through when the store is unavailable.
- **Config readers are cached in a module-level `Map`.** The env variable is still read at call time (honouring a changed environment), but the reader closure itself is built once per namespace to avoid redundant config-slice definition.
