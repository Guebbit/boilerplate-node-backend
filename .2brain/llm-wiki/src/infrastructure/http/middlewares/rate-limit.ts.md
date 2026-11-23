---
source: src/infrastructure/http/middlewares/rate-limit.ts
source_sha256: b628012f31cf33b079089b976b7bf77e7cfef53cad088ed1787a87a24a4f8771
context_sha256: f7fb717b6706e247670625de7ae41a9bb19c84b638f18652d45ee7f5f1544eb2
generated_at: 2026-11-22T02:51:58.065222+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/middlewares/rate-limit.ts

## Purpose
Holds the shared rate-limiting machinery for the HTTP layer. It owns three budgets that no module owns: the global burst brake (`rateLimiter`), the credential-keyed api-key budget (`apiKeyLimiter`) and the image-upload budget (`uploadLimiter`, shared by `account`, `products` and `users`). It also exposes `buildRateLimiter`, the factory that every module's own `rate-limits.ts` budget goes through. Refusals always use the shared error envelope, never express-rate-limit's plain-text body.

## Key elements
- `DEFAULT_RATE_LIMIT_MAX`, `DEFAULT_UPLOAD_RATE_LIMIT_MAX`, `DEFAULT_API_KEY_RATE_LIMIT_MAX`: default ceilings, read from `infrastructureRateLimitData` (`./rate-limits.generated`). The global default applies when `NODE_RATE_LIMIT_MAX` is unset.
- `recordBudgetRefusal(budget, context, metadata)`: increments `rateLimitRefusalsTotal` (labelled by budget namespace). It also records a `SECURITY_RATE_LIMIT_HIT` audit with outcome `failure`, but only if the budget is `audited`. It can be called by a limiter at the route door or by a service charging the budget itself.
- `refuseRateLimited(budget, handChargedSeconds?)`: builds the express-rate-limit `handler`. It does the following:
  - Announces the budget headers.
  - Computes the retry wait from the limiter's info, or from `handChargedSeconds` (default 1) for hand-charged budgets.
  - Records the refusal.
  - Responds through `refuseAntibot('rate-limit', …, 429, generateRateLimited(...).errors)`, with `details.policy` set to the namespace.
- `buildRateLimiter(budget)`: turns a `RateLimitBudget` into an Express `RequestHandler`. It wraps `rateLimit()` with:
  - A store from `rateLimitStore(namespace, onStoreError ?? 'memory', escalation)`.
  - Window and limit via `budgetWindowMs` and `budgetLimit`.
  - `standardHeaders` and `legacyHeaders` off, and `handler: refuseRateLimited(budget)`.
  - Optional `keyGenerator`, `skip`, `requestWasSuccessful` and `skipSuccessfulRequests`.
  - A per-budget `requestPropertyName`.
  - The returned wrapper calls the limiter and then writes headers on the pass.
- Internal helpers:
  - `budgetWindowMs`: resolves `'shared'` to `NODE_RATE_LIMIT_WINDOW_MS`.
  - `secondsUntil`: whole seconds until reset, minimum 1.
  - `infoSlotOf`: names the request property that holds the limiter info, `rateLimit:<namespace>` by default.
  - `announceBudget`: appends `RateLimit-Policy` and `RateLimit` entries in the IETF draft syntax.
  - `limiterLogger`: routes express-rate-limit's own warnings and errors to the app logger.
  - `limitReaders` / `budgetLimit`: a cached per-namespace config reader, evaluated at call time.

## Relationships
- `rate-limit-store.ts`: supplies the Redis-or-memory store. It falls back to in-process counting on a store error.
- `@infrastructure/http/config` (`rateLimitConfig`, `rateLimitBudgetConfig`): provides the shared window and per-budget limit variables.
- `@infrastructure/http/response`: provides `generateRateLimited` (the 429 envelope) and `rateLimitItem` (the `RateLimit` header item).
- `@infrastructure/http/request`: `callerContextOf` supplies the context for audits and metrics.
- `antibot-log.ts`: `refuseAntibot` logs and sends every refusal.
- `observability/audit` and `observability/metrics-rate-limit`: receive the audit record and the refusal counter.
- `adapters/logger`: receives the library's configuration warnings.
- `normalize-email` and `security/pseudonymise`: imported here, along with `isIPv4` and `ipKeyGenerator`. Their use is in the part of the file not shown.
- `scripts/docs/generate-rate-limit-budgets.ts`: the defaults come from generated data, so this docs script is probably tied to the same budget data. That link is inferred from the names.

## Notes
- Headers are written by this file rather than by express-rate-limit. The library's `draft-8` writer adds `pk`, a truncated unsalted hash of the caller's key, which would identify the caller.
- With the library's headers off, `Retry-After` is written alongside the `RateLimit` entry (the code says `rejectResponse` does this, RFC 9110 §10.2.3).
- Only a budget with `onStoreError: 'pass'` lets requests through when its store fails. Every other budget falls back to in-memory counting, so a Redis blip is neither an outage nor an open door.
- Auditing is opt-in per budget. Credential budgets audit every refusal, but the global brake does not, because port-scan noise would bury the trail. Every refusal still goes through `refuseAntibot`. This matters because `installSecurity` mounts these limiters before `installRequestContext` mounts the request logger, so a 429 would otherwise leave no trace.
- The upload budget keeps `skipSuccessfulRequests` off because a well-formed upload is the expensive case (the `worker.image.digest` CPU cost).
- Each budget gets its own request slot for its limiter info, so a skipped limiter leaves nothing for a later one to misread.
