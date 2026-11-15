---
source: src/modules/payments/rate-limits.ts
sha256: 40e3af56d01f0d5b945f685c194f03101dc118b1421373d1ffd0d1e33d9675f0
generated_at: 2026-11-14T21:04:22.640625+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/rate-limits.ts

## Purpose

Declares and builds the payments module's rate-limit budgets (webhook forgery ceiling, confirm-attempt/decline/intent-sync caps) and a composite human-challenge gate. Each budget is plain `RateLimitBudget` data turned into Express middleware via the shared `buildRateLimiter` factory, so this file is purely wiring: it picks keying strategy, success semantics, and mount points for the payments routes.

## Key elements

- **`webhookLimiter`** — Rate-limits unauthenticated webhook deliveries per *address block*; verified (signature-passing) deliveries are refunded via `skipSuccessfulRequests: true`.
- **`paymentConfirmAttemptLimiter`** — Blunt per-account hourly cap on `POST /:id/confirm` attempts regardless of outcome.
- **`paymentConfirmDeclineLimiter`** — Per-account decline-only budget; uses a custom `requestWasSuccessful` that checks the controller-set `request.paymentConfirmDeclined` flag (not raw status code) so `PAYMENT_ORDER_NOT_PAYABLE` (a race, not a decline) doesn't spend it. Stores its counter under `request.paymentDeclineRateLimit`.
- **`paymentConfirmDeclineBlockLimiter`** — Same decline detection but keyed per *address block* (catches testers rotating accounts from one network). Stores its counter under `request.paymentDeclineBlockRateLimit`.
- **`paymentIntentLimiter`** — Single shared budget for both intent-creation and sync routes; must be mounted as one instance on both so they share a counter.
- **`paymentDeclineChallengeGate`** — Composite middleware: delegates to `humanChallengeGate` when the account has ≥ 1 prior decline *or* the address block has spent ≥ 50 % of its decline budget; otherwise passes through.
- **`paymentsRateLimits`** — Read-only array of all five `RateLimitBudget` objects, referenced by the module's `rateLimits` declaration.

## Relationships

- **`@infrastructure/http/middlewares/rate-limit`** — Source of `buildRateLimiter`, `rateLimitInfoOf`, `priorHits`, `accountIdOf`, `addressBlockOf`, and the `KEYED_BY_*` constants; this file is a consumer of that factory.
- **`@infrastructure/http/middlewares/human-challenge`** — `paymentDeclineChallengeGate` delegates to `humanChallengeGate` when its conditions are met.
- **`src/types/index.ts` / `src/types/rate-limit-budget.ts`** — Supply the `RateLimitBudget` type shape every budget literal conforms to.
- **`src/modules/payments/tests/unit/rate-limits.test.ts`** — Unit tests for the budget objects and gate logic in this file.
- **`src/modules/payments/tests/integration/payment-velocity.test.ts`** — Integration test exercising the confirm-attempt/decline budgets end-to-end.
- **`src/modules/payments/tests/integration/webhook-rate-limit.test.ts`** — Integration test exercising `webhookLimiter` against the webhook route.

## Notes

- `paymentIntentLimiter` is **one** `RequestHandler` instance meant to be attached to two routes. Attaching two separately-built instances would create two independent counters and double the effective budget.
- The two decline limiters override `requestWasSuccessful` to read a controller-set boolean (`request.paymentConfirmDeclined`) instead of the stock `statusCode < 400` heuristic. The controller **must** set that flag for the budget to work correctly.
- `paymentDeclineChallengeGate` reads rate-limit counters from `request` via `rateLimitInfoOf`; it only works when mounted **after** both decline limiters in the middleware chain.
- `priorHits` excludes the current request's provisional count, so the gate arms at exactly the threshold rather than one step past it.
- During a Redis outage the underlying store falls back to in-memory (`failoverStore`); the gate reads whatever numbers the fallback has, so protection degrades gracefully rather than failing open.
- Numeric limits and thresholds come from a generated data module (`paymentsRateLimitData`), spread into each budget literal at build time.
