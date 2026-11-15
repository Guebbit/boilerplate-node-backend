---
source: src/infrastructure/http/middlewares/rate-limit.ts
sha256: 151aa29a70970f8004940d230ddaeccb61ff2acddd59f9dd16eb30c6955e4d0d
generated_at: 2026-11-14T18:03:56.218789+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/rate-limit.ts

## Purpose

Shared rate-limiting machinery for the application. Owns the three budgets no individual module claims (global burst brake, API-key credential budget, image-upload budget), and exposes `buildRateLimiter` — the single factory every module's own budget in its `rate-limits.ts` goes through. Also centralises the 429 refusal path (headers, audit, metrics, error envelope) so no limiter reimplements it.

## Key elements

- **`buildRateLimiter(budget: RateLimitBudget): RequestHandler`** — Turns a budget declaration into a working Express middleware. Wires the store, window, limit, key generator, handler, and `requestPropertyName`. Appends `RateLimit-Policy` / `RateLimit` headers on the pass-through path.
- **`refuseRateLimited(budget, handChargedSeconds?)`** — Factory for the 429 handler. Announces the budget's headers, records metrics + optional audit, logs via `refuseAntibot`, and returns the shared error envelope (never the library's plain-text body).
- **`recordBudgetRefusal(budget, context, metadata)`** — Increments `rateLimitRefusalsTotal` and, when `budget.audited` is true, writes an audit entry.
- **`announceBudget(budget, req, res)`** — Appends the budget's entry to `RateLimit-Policy` and `RateLimit` headers in IETF draft syntax. Hand-rolled to avoid the library's `pk` parameter (which would leak a truncated caller identifier).
- **`DEFAULT_RATE_LIMIT_MAX` / `DEFAULT_UPLOAD_RATE_LIMIT_MAX` / `DEFAULT_API_KEY_RATE_LIMIT_MAX`** — Fallback ceilings sourced from generated budget data.
- **`limiterLogger`** — Routes express-rate-limit's internal config warnings (e.g. `X-Forwarded-For` without `trust proxy`) to the app logger instead of `console`.
- **`limitReaders` / `budgetLimit`** — Memoised config readers so an env-var change after limiter construction is still honoured at call time.
- **`budgetWindowMs` / `secondsUntil` / `infoSlotOf`** — Small helpers resolving window (own vs `'shared'`), Retry-After seconds, and the per-budget `requestPropertyName` slot.

## Relationships

- **`rate-limit-store.ts`** — Provides `rateLimitStore`, the Redis-or-memory backing. This file selects `'memory'` failover or `'pass'` per budget via `onStoreError`.
- **`response.ts`** — `generateRateLimited` builds the 429 error body; `rateLimitItem` formats one `RateLimit` header entry.
- **`antibot-log.ts`** — `refuseAntibot` is the final writer of the 429 response, guaranteeing a log trace even though limiters are mounted before `installRequestContext`.
- **`request.ts`** — `callerContextOf` extracts the authenticated caller for audit metadata on every refusal.
- **`config.ts` (http)** — `rateLimitBudgetConfig` and `rateLimitConfig` supply per-budget limit env-var names and the shared window (`NODE_RATE_LIMIT_WINDOW_MS`).
- **`audit.ts`** — `recordAudit` persists audited refusals (action, outcome, metadata).
- **`metrics-rate-limit.ts`** — `rateLimitRefusalsTotal` counter, tagged by budget namespace.
- **`normalize-email.ts` / `pseudonymise.ts`** — Imported for caller-identifier handling in key generation or skip predicates.
- **`logger.ts`** — Receives `limiterLogger` warnings and the store-error notice.
- **`generate-rate-limit-budgets.ts`** — Produces the budget data from which the three exported defaults are read.

## Notes

- **Headers are hand-written on purpose.** `standardHeaders` and `legacyHeaders` are both `false` so the library never emits `pk` (a truncated, unsalted hash of the caller key). `announceBudget` writes only namespace, limit, window, remaining, and reset.
- **Audit is opt-in per budget.** Credential budgets (API key, etc.) set `audited: true` because a burst of refusals is the leading signal of credential stuffing. The global brake does *not* audit — a port scan would bury the signal in noise.
- **429 short-circuits before the request logger.** Limiters are mounted ahead of `installRequestContext`, so without `refuseAntibot` the global brake would leave no trace at all.
- **`skipSuccessfulRequests` stays off for uploads.** A well-formed upload is the expensive case (image-digest CPU); a rejected one is cheap.
- **`passOnStoreError` is `false` by default.** A Redis blip falls back to in-process counting (one bucket per node) rather than opening the door. Only budgets explicitly marked `onStoreError: 'pass'` let traffic through during a store outage.
- **One `requestPropertyName` slot per budget** prevents a skipped limiter from leaving stale `RateLimitInfo` that a later stacked limiter could misread.
