---
source: src/modules/payments/tests/integration/payment-velocity.test.ts
sha256: 697239b6d7764fd2cd5b7c084c3c27ad6423d76fc8aedcab28cb444e3272a600
generated_at: 2026-09-23T19:23:28.870346+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/payment-velocity.test.ts

## Purpose

Integration tests for the three payment-confirm rate limiters (`attempt`, `decline`, `challenge gate`) mounted on `POST /payments/:id/confirm`. The tests exercise the limiters directly against trivial Express handlers rather than the real payment route, because the property under test belongs to the limiters themselves and a real route would add a database round-trip to every attempt. Route-mounting correctness is covered separately in `payments/tests/unit/routes.test.ts`.

## Key elements

- **`asAccount(id)`** — RequestHandler stub that attaches a minimal `AuthContext` (`{ id }`) to `request.authContext`, satisfying `accountIdOf` without a real auth middleware.
- **`declineAwareApp(declineLimiter)`** — Builds a small Express app whose handler sets `request.paymentConfirmDeclined` based on a `body.outcome` field (`declined` / `order-lost` / `succeeded`), returning the corresponding 409/409/200. Lets the decline limiter see the flag it reads.
- **`limitersWithBudget(attemptLimit, declineLimit)`** — Re-evaluates `@modules/payments/rate-limits` under custom `NODE_PAYMENT_*_RATE_LIMIT_MAX` env vars via `withReloadedRateLimits`, returning a fresh module instance.
- **`describe` — confirm-attempt budget** — Verifies 429 after budget exhaustion (even on success) and per-account isolation.
- **`describe` — decline budget** — Verifies only a genuine decline (`paymentConfirmDeclined = true`) spends the budget; lost-order 409s and successes do not.
- **`describe` — paymentDeclineChallengeGate** — Verifies the gate is inert without `NODE_ANTIBOT_PROVIDER`, passes the first decline through, and returns `401 ANTIBOT_VERIFICATION_FAILED` only when a prior decline exists _and_ a provider is configured.

## Relationships

- **`src/modules/payments/rate-limits.ts`** — The module under test; source of `paymentConfirmAttemptLimiter`, `paymentConfirmDeclineLimiter`, and `paymentDeclineChallengeGate`.
- **`tests/support/rate-limit-harness.ts`** — Supplies `withReloadedRateLimits`, which wraps `jest.resetModules()` + dynamic import with custom env so a fresh limiter instance can be constructed per test.
- **`tests/support/stub.ts`** — Supplies `asStub` to create the minimal `AuthContext` object.
- **`src/types/auth-context.ts`** (via `src/types/index.ts`) — Provides the `AuthContext` type for the stub.

## Notes

- `rateLimit()` captures its options **once at construction**; changing env vars afterwards has no effect. Every test that needs a different budget must re-import the module (the `withReloadedRateLimits` / `jest.resetModules()` pattern).
- The attempt limiter counts **all** outcomes (success included), unlike credential-based budgets. This is intentional: a card can be swapped between attempts on the same payment intent.
- The decline limiter and the challenge gate must originate from the **same** module instance, because the gate reads a property name the decline limiter was configured with. Mixing instances silently breaks the gate.
- `NODE_ANTIBOT_PROVIDER` is saved/restored around the gate tests; forgetting to restore it would leak into sibling tests.
