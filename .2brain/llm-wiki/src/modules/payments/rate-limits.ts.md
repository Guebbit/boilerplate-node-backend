---
source: src/modules/payments/rate-limits.ts
sha256: fff4f8566498137d214407d01c9af09c7e34e7614d35e6fb5b01d579397a9dae
generated_at: 2026-10-29T05:08:54.953291+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/rate-limits.ts

## Purpose

Defines the payments module's rate-limit budgets (webhook, confirm attempts, confirm declines per account and per address block, intent/sync) and builds each into an Express middleware via the shared `buildRateLimiter` factory. It also composes a challenge gate that escalates to a human challenge when an account or its address block has already burned into the decline budget.

## Key elements

- **`webhookLimiter`** — Express middleware capping unauthenticated `POST /payments/webhook/{provider}` deliveries per client address per window.
- **`paymentConfirmAttemptLimiter`** — Middleware capping the total confirm-attempt loop per authenticated account per hour (regardless of outcome).
- **`paymentConfirmDeclineLimiter`** — Middleware that spends budget only on *genuine* declines (detected via `request.paymentConfirmDeclined`, not status code), per account.
- **`paymentConfirmDeclineBlockLimiter`** — Same decline-detection logic but keyed by the caller's address block, catching card-testers rotating across accounts from one network.
- **`paymentIntentLimiter`** — Single middleware instance (shared between the intent-creation and sync routes) capping both to one counter per account per hour.
- **`paymentDeclineChallengeGate`** — Middleware mounted *after* the two decline limiters; delegates to `humanChallengeGate` once the account has ≥ 1 prior decline or the address block has spent ≥ 50 % of its block-decline budget. No-op until a challenge provider is configured.
- **`paymentsRateLimits`** — Readonly array of all five budget objects, re-exported for registration on `module.ts`'s `rateLimits`.

## Relationships

- **`@infrastructure/http/middlewares/rate-limit`** — Source of `buildRateLimiter`, `rateLimitInfoOf`, `priorHits`, `accountIdOf`, `addressBlockOf`, and the three `KEYED_BY_*` constants. All budgets are turned into middleware through this factory.
- **`@infrastructure/http/middlewares/human-challenge`** — `paymentDeclineChallengeGate` delegates to `humanChallengeGate` when its escalation condition is met.
- **`./rate-limits.generated.ts`** — Provides the numeric budget values (`paymentsRateLimitData.*`) that are spread into each `RateLimitBudget` object.
- **`./module.ts`** — Consumes `paymentsRateLimits` to register the budgets on the module's public `rateLimits` surface.
- **`./routes.ts`** — Mounts the exported limiters and gate on the webhook, confirm, intent, and sync routes (declared in JSDoc; not a direct import here).
- **`@types`** (`src/types/index.ts` → `src/types/rate-limit-budget.ts`) — Supplies the `RateLimitBudget` interface used to type every budget constant.
- **`tests/unit/rate-limits.test.ts`** — Unit-tests the budget shapes and gate logic.
- **`tests/integration/payment-velocity.test.ts`** — Integration-tests the limiters end-to-end against the routes.

## Notes

- `paymentIntentLimiter` is intentionally a **single** middleware instance mounted on two routes (intent create + sync). Instantiating it twice would give each route its own counter.
- `requestWasSuccessful` on both decline budgets checks `!request.paymentConfirmDeclined` rather than the default `statusCode < 400`. This is critical because `PAYMENT_ORDER_NOT_PAYABLE` (409) is a race condition, not a decline, and must not spend the budget.
- The gate reads counters from `request` properties (`paymentDeclineRateLimit`, `paymentDeclineBlockRateLimit`) that the limiters set. **Ordering matters**: both decline limiters must run before `paymentDeclineChallengeGate` in the route chain.
- `priorHits` subtracts the current request's provisional count, so the gate arms at exactly the stated threshold (≥ 1 prior decline, ≥ 50 % of block budget) rather than one step early.
- During a Redis outage the budget store falls back to in-memory counting (`failoverStore`); the gate still reads those numbers and behaves identically.
