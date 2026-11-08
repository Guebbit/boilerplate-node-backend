---
source: src/modules/payments/rate-limits.ts
sha256: fff4f8566498137d214407d01c9af09c7e34e7614d35e6fb5b01d579397a9dae
generated_at: 2026-11-08T07:24:22.986295+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/rate-limits.ts

## Purpose

Declares and exports the five rate-limit budgets that protect the payments module's HTTP surface — the unauthenticated webhook route, the authenticated confirm/intent/sync routes — and wires a conditional human-challenge gate on top of the two decline budgets. Each budget is plain `RateLimitBudget` data (sourced from `rate-limits.generated`) converted to an Express middleware via the shared `buildRateLimiter` factory.

## Key elements

- **`webhookLimiter`** — per-address ceiling on `POST /payments/webhook/{provider}`; the only unauthenticated write surface. Sized for burst deliveries, not steady-state.
- **`paymentConfirmAttemptLimiter`** — per-account cap on the intent→confirm loop regardless of outcome; the blunt cap.
- **`paymentConfirmDeclineLimiter`** — per-account counter that spends *only* on genuine declines (custom `requestWasSuccessful` checks `request.paymentConfirmDeclined`); excludes the 409 race (`PAYMENT_ORDER_NOT_PAYABLE`).
- **`paymentConfirmDeclineBlockLimiter`** — same decline signal but keyed on the caller's address **block**, catching testers rotating accounts from one network; higher threshold (10/hr) because a block is shared by many honest users.
- **`paymentIntentLimiter`** — one shared per-account budget for intent creation *and* sync (both call the payment provider). A single middleware instance is mounted on both routes so the counter is unified.
- **`paymentDeclineChallengeGate`** — composite handler: passes the first attempt through, then delegates to `humanChallengeGate` once the account has ≥ 1 prior decline *or* the address block has spent ≥ 50 % of its decline budget.
- **`paymentsRateLimits`** — readonly array of all five budget objects, referenced by `./module.ts`'s `rateLimits` declaration.
- **Internal helpers** — `hasAPriorDecline`, `blockBudgetMostlySpent`, and the `PAYMENT_*_RATE_LIMIT_PROPERTY` constants that locate each limiter's counter on the Express `request` object.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — provides `buildRateLimiter`, `rateLimitInfoOf`, `priorHits`, `accountIdOf`, `addressBlockOf`, and the `KEYED_BY_*` enums used here.
- **`src/infrastructure/http/middlewares/human-challenge.ts`** — provides `humanChallengeGate`, which `paymentDeclineChallengeGate` delegates to when armed.
- **`src/modules/payments/module.ts`** — lists `paymentsRateLimits` in its `rateLimits` declaration so the module registry can discover all budgets.
- **`src/modules/payments/routes.ts`** — mounts the exported limiters and the gate on the relevant Express routes.
- **`src/types/rate-limit-budget.ts`** — defines the `RateLimitBudget` interface each budget object conforms to.
- **`src/types/index.ts`** — re-exports `RateLimitBudget` for the `@types` import alias used here.
- **`src/modules/payments/tests/unit/rate-limits.test.ts`** — unit tests for budget shapes, keying, and gate logic.
- **`src/modules/payments/tests/integration/payment-velocity.test.ts`** — integration tests exercising the limiters under load.

## Notes

- **Single-instance constraint:** `paymentIntentLimiter` must be the *same* middleware object on both the intent-creation and sync routes; instantiating it twice would create two independent counters and effectively double the budget.
- **`requestWasSuccessful` override:** The decline limiters do *not* use the stock `statusCode < 400` check. A 409 `PAYMENT_ORDER_NOT_PAYABLE` (a race) must not spend the decline budget; the controller sets `request.paymentConfirmDeclined = true` only on a genuine provider decline.
- **`priorHits` semantics:** express-rate-limit counts the current request provisionally and undoes it after `requestWasSuccessful` resolves. `priorHits` subtracts that one, so the challenge gate arms at exactly the threshold (e.g., the 2nd decline, not the 1st) and at exactly 50 % of the block limit.
- **Redis failover:** On a Redis outage the limiters fall back to an in-memory `failoverStore`; the gate reads whichever store the limiter wrote, so it continues to function (albeit without cross-process visibility).
- **Budget values are generated:** All numeric limits come from `./rate-limits.generated`, not hardcoded here. Edit the generator source, not this file, to change thresholds.
- **Challenge gate is a no-op until configured:** `humanChallengeGate` passes through when no provider is configured, so deploying this gate has zero effect until a challenge provider is wired up.
