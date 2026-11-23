---
source: src/modules/payments/rate-limits.ts
source_sha256: 7630ebb9c0d11438fac573734214edffb8696c7b261d502c4c219c43e93e88db
context_sha256: 5b196cb73f85c503e412cecb1408ffc763ddc01f1bd7716dadeb38186f18fe94
generated_at: 2026-11-22T06:48:12.559314+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/rate-limits.ts

## Purpose
Declares the payments module's rate-limit budgets and turns each into Express middleware via the shared `buildRateLimiter` factory. It covers the unauthenticated webhook, pooled intent/sync calls, and a set of card-testing defenses on `POST /payments/:id/confirm`, including a gate that conditionally requires a human challenge.

## Key elements
- `webhookLimiter`: limits refused webhook deliveries, keyed by address block. Verified deliveries are refunded (`skipSuccessfulRequests`).
- `paymentConfirmAttemptLimiter`: caps all confirm attempts per authenticated account per hour, regardless of outcome.
- `paymentConfirmDeclineLimiter`: counts genuine declines per account. A request is "successful" unless `request.paymentConfirmDeclined` is set. Its counter is stored on `request.paymentDeclineRateLimit`.
- `paymentConfirmDeclineBlockLimiter`: counts genuine declines per address block, with a larger budget because a block is shared by many people. Its counter is stored on `request.paymentDeclineBlockRateLimit`.
- `paymentIntentLimiter`: a single per-account counter shared by intent creation and sync. Every request counts.
- `paymentDeclineChallengeGate`: calls `humanChallengeGate` if the account has at least one prior decline or the address block has spent at least half of its decline budget. Otherwise it calls `next()`.
- `paymentsRateLimits`: the array of the five `RateLimitBudget` objects (webhook, confirm attempt, confirm decline, confirm decline block, intent/sync).
- Private helpers: `hasAPriorDecline` and `blockBudgetMostlySpent` read the counters via `rateLimitInfoOf` and `priorHits`. `CHALLENGE_AFTER_BLOCK_BUDGET_SPENT` is 0.5.
- Private `*_BUDGET` constants spread numeric settings from `paymentsRateLimitData` (`./rate-limits.generated`) and add keying and skip behavior.

## Relationships
- `src/infrastructure/http/middlewares/rate-limit.ts`: supplies `buildRateLimiter`, `rateLimitInfoOf`, `priorHits`, the key generators (`accountIdOf`, `addressBlockOf`) and the `KEYED_BY_*` constants.
- `src/infrastructure/http/middlewares/human-challenge.ts`: supplies `humanChallengeGate`, which the decline gate delegates to.
- `src/types/rate-limit-budget.ts` (also exported through `src/types/index.ts`): defines the `RateLimitBudget` type.
- `src/modules/payments/module.ts`: lists `paymentsRateLimits` in its `rateLimits`.
- `src/modules/payments/routes.ts`: mounts the limiters and the gate. The docs say `paymentIntentLimiter` is mounted on both the intent and sync routes.
- Tests: `src/modules/payments/tests/unit/rate-limits.test.ts`, `src/modules/payments/tests/integration/payment-velocity.test.ts` and `src/modules/payments/tests/integration/webhook-rate-limit.test.ts` cover this file.

## Notes
- The gate must be mounted after both decline limiters, because it reads the counters they store on the request. If a counter is missing, it reads as "not yet".
- `priorHits` excludes the current request's provisional count, so the block gate arms at exactly half the budget.
- `paymentConfirmDeclined` is set by the controller. The route's other 409, `PAYMENT_ORDER_NOT_PAYABLE`, is a race rather than a decline and does not spend the decline budgets.
- `paymentIntentLimiter` must be a single shared instance, because two instances of one budget would count separately.
- `humanChallengeGate` is a no-op until a human-challenge provider is configured.
- During a Redis outage the budgets count in memory (`failoverStore`), and the gate reads the fallback's numbers.
