---
source: src/modules/payments/rate-limits.ts
sha256: 13be7e4d1ce942d86375abb272385e181117260c14c8ad804ed36d4f70d5c040
generated_at: 2026-09-23T19:20:03.581860+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/rate-limits.ts

## Purpose

Defines the three rate-limit budgets for the payments module (webhook deliveries, confirm attempts, confirm declines) and turns each into an Express middleware via the shared `buildRateLimiter` factory. It also exports a small gate that escalates to a human challenge once an account has a prior decline on record.

## Key elements

- **`webhookLimiter`** — per-address limiter for `POST /payments/webhook`; default 60 per shared window; the only unauthenticated write surface.
- **`paymentConfirmAttemptLimiter`** — per-account, 5 attempts/hour on `POST /:id/confirm`; bounds the intent→confirm loop regardless of outcome.
- **`paymentConfirmDeclineLimiter`** — per-account, 3 declines/hour; uses a custom `requestWasSuccessful` that reads `request.paymentConfirmDeclined` (set by the controller) so that `PAYMENT_ORDER_NOT_PAYABLE` (a 409 race) does not spend the budget.
- **`paymentDeclineChallengeGate`** — reads the decline limiter's counter off `request`; if a prior decline exists, delegates to `humanChallengeGate`; otherwise passes through. No-op until a challenge provider is configured.
- **`paymentsRateLimits`** — the `readonly RateLimitBudget[]` consumed by `module.ts`'s `rateLimits` declaration.
- **`hasAPriorDecline`** (internal) — fail-open check: missing rate-limit info is treated as "no prior decline."

## Relationships

- **`@infrastructure/http/middlewares/rate-limit`** — provides `buildRateLimiter`, `rateLimitInfoOf`, `accountIdOf`, and the two `KEYED_BY_*` constants.
- **`@infrastructure/http/middlewares/human-challenge`** — `paymentDeclineChallengeGate` delegates to its `humanChallengeGate` export.
- **`src/modules/payments/module.ts`** — imports `paymentsRateLimits` to register the budgets.
- **`src/modules/payments/routes.ts`** — mounts the four exported middlewares on the webhook and confirm routes.
- **`src/types/rate-limit-budget.ts`** (via `@types`) — source of the `RateLimitBudget` type used by every budget object here.
- **`src/modules/payments/tests/unit/rate-limits.test.ts`** — unit tests for the budgets and gate logic.
- **`src/modules/payments/tests/integration/payment-velocity.test.ts`** — integration tests exercising the confirm-attempt and decline budgets end-to-end.

## Notes

- The two confirm budgets use a **fixed 1-hour window** (`PAYMENT_VELOCITY_WINDOW_MS`), not the shared browsing window; the duration is part of the budget's meaning.
- `hasAPriorDecline` compares `info.remaining < info.limit - 1` (not `< info.limit`) because express-rate-limit increments the counter _before_ the outcome is known; the off-by-one cancels out the current request's provisional count.
- The webhook budget is keyed by **address**, not account, because the route is unauthenticated and the provider's IP is not an application-level identity.
- `requestWasSuccessful` on the decline budget is intentionally non-standard — it reads a flag the controller sets (`request.paymentConfirmDeclined`) rather than the default `statusCode < 400` heuristic, to exclude the `PAYMENT_ORDER_NOT_PAYABLE` race from spending the budget.
