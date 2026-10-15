---
source: src/modules/payments/rate-limits.ts
sha256: 9a11c79e378b14a11082f65395c8b6d3f3ca0421ecc2667e00f628941ddd6c2b
generated_at: 2026-10-15T11:28:18.031469+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/rate-limits.ts

## Purpose

Defines the payments module's rate-limit budgets and the Express middleware derived from them. It exists to put explicit ceilings on the unauthenticated webhook route, the intent→confirm loop, and the card-testing attack surface on `POST /:id/confirm`, and to escalate to a human challenge when decline patterns cross a threshold.

## Key elements

- **`webhookLimiter`** — `RequestHandler` for `POST /payments/webhook`; 60 deliveries/window, keyed by caller address. The only unauthenticated write surface in the API.
- **`paymentConfirmAttemptLimiter`** — caps confirm attempts to 5/account/hour regardless of outcome; bounds the re-confirm loop itself.
- **`paymentConfirmDeclineLimiter`** — counts only genuine declines (3/account/hour). Uses a custom `requestWasSuccessful` that checks `request.paymentConfirmDeclined` (set by the controller) so the route's *other* 409 (`PAYMENT_ORDER_NOT_PAYABLE`) does not spend the budget.
- **`paymentConfirmDeclineBlockLimiter`** — same decline signal but keyed by address block (10/block/hour); catches a tester rotating accounts from one network.
- **`paymentIntentLimiter`** — single middleware instance (30/account/hour) mounted on both `POST /payments/intent` and `POST /payments/:id/sync`; one shared counter for both routes.
- **`paymentDeclineChallengeGate`** — middleware that passes the first attempt through, then delegates to `humanChallengeGate` once the account has ≥1 prior decline *or* the address block has spent ≥50 % of its decline budget.
- **`paymentsRateLimits`** — `readonly RateLimitBudget[]` exposing all five budget definitions for registration in the module manifest.
- **`PAYMENT_VELOCITY_WINDOW_MS`** — fixed 1-hour window shared by the four per-account budgets.
- **`CHALLENGE_AFTER_BLOCK_BUDGET_SPENT`** — `0.5`; the fraction of block budget that arms the challenge gate.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — provides `buildRateLimiter` (turns each budget object into a `RequestHandler`), `rateLimitInfoOf` / `priorHits` (counter reads used by the gate), `accountIdOf` / `addressBlockOf` (key generators), and the `KEYED_BY_*` constants.
- **`src/infrastructure/http/middlewares/human-challenge.ts`** — provides `humanChallengeGate`, the downstream handler that `paymentDeclineChallengeGate` invokes when armed.
- **`src/modules/payments/routes.ts`** — imports and mounts the six exported middleware (`webhookLimiter`, `paymentConfirmAttemptLimiter`, `paymentConfirmDeclineLimiter`, `paymentConfirmDeclineBlockLimiter`, `paymentIntentLimiter`, `paymentDeclineChallengeGate`) on the appropriate routes. The gate must be mounted *after* both decline limiters.
- **`src/modules/payments/module.ts`** — consumes `paymentsRateLimits` to register the budgets in the module's `rateLimits` manifest.
- **`src/types/rate-limit-budget.ts`** — defines the `RateLimitBudget` interface (re-exported via `src/types/index.ts`) that every budget object in this file conforms to.
- **`src/modules/payments/tests/unit/rate-limits.test.ts`** / **`src/modules/payments/tests/integration/payment-velocity.test.ts`** — unit and integration tests covering budget behavior and the gate logic.

## Notes

- `paymentIntentLimiter` is **one** middleware instance mounted on two routes. Mounting two separate instances of the same budget would produce two independent counters.
- The two decline budgets set `skipSuccessfulRequests: true` *and* a custom `requestWasSuccessful`, so only a controller-flagged decline spends the budget. The stock `statusCode < 400` check would miscount the `PAYMENT_ORDER_NOT_PAYABLE` 409.
- `requestPropertyName` (`PAYMENT_DECLINE_RATE_LIMIT_PROPERTY` / `PAYMENT_DECLINE_BLOCK_RATE_LIMIT_PROPERTY`) is where express-rate-limit stashes its counter on `request`; the gate reads it via `rateLimitInfoOf`. Missing info (limiter not yet run) is treated as "not yet" — the gate is a no-op.
- `priorHits` subtracts the current request's provisional count, so the gate arms at exactly the threshold (1 prior decline, or 50 % of block limit) rather than one past it.
- During a Redis outage the budgets fall back to an in-memory store (`failoverStore`); the gate still reads numbers from that fallback.
