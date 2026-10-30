---
source: src/modules/payments/tests/integration/payment-velocity.test.ts
sha256: e968ed79d847b045d4958f5bbcf4f3345f4fc1383e723cddf087b74c847f0b1d
generated_at: 2026-10-29T05:17:41.076895+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/payment-velocity.test.ts

## Purpose

Integration tests for the rate-limiting chain on `POST /payments/:id/confirm`: the per-account confirm-attempt budget, the per-account decline budget, the anti-bot challenge gate (rung 3), and the shared address-block decline budget. The tests exercise the limiters in isolation using trivial Express handlers via `supertest`, deliberately avoiding the real `postPaymentConfirm` route to keep the property under test (the limiters' counting and gating logic) separate from payment domain logic and database round-trips.

## Key elements

- **`asAccount(id)`** — A one-off `RequestHandler` that attaches a minimal `AuthContext` stub (only `.id` is set) to the request, standing in for `getAuth`.
- **`declineAwareApp(declineLimiter)`** — Builds a minimal Express app whose handler sets `request.paymentConfirmDeclined` to `true` only when the body's `outcome` is `"declined"`, then returns 200/409 accordingly. Used to test the decline limiter's counting rules.
- **`limitersWithBudget(attemptLimit, declineLimit?)`** — Wraps `withReloadedRateLimits` to dynamically import `@modules/payments/rate-limits` with specific env-var budgets, returning the freshly-constructed limiter instances.
- **`appWithBudget(declineLimit)`** — Builds an app chaining `paymentConfirmDeclineLimiter → paymentDeclineChallengeGate → handler`, importing both from the **same** module instance after `setEnvironment` + `jest.resetModules()`. Used to test the challenge gate.
- **`blockApp(accountLimit, blockLimit)`** — Builds an app with the full production chain (`account limiter → block limiter → gate → handler`) to test the shared address-block budget across multiple accounts.
- **`describe` blocks** — Four groups: confirm-attempt budget (exhaustion + per-account isolation), decline budget (spends on decline, ignores order-lost 409, ignores success), challenge gate (inactive without provider, passes first decline, challenges on second), address-block budget (shared exhaustion, non-declines don't spend, gate + refusal sequence).

## Relationships

- **`src/modules/payments/rate-limits.ts`** — The module under test. Dynamically imported after `jest.resetModules()` to get fresh limiter instances with overridden budgets. Exports: `paymentConfirmAttemptLimiter`, `paymentConfirmDeclineLimiter`, `paymentConfirmDeclineBlockLimiter`, `paymentDeclineChallengeGate`.
- **`src/types/auth-context.ts`** — Provides the `AuthContext` type; the test stubs only the `.id` field that `accountIdOf` (inside the limiters) reads.
- **`src/types/index.ts`** — Barrel re-export; the file imports `AuthContext` via `@types` which resolves here.
- **`tests/support/environment.ts`** — `setEnvironment` is called before each dynamic import to control the env vars (`NODE_PAYMENT_CONFIRM_RATE_LIMIT_MAX`, `NODE_PAYMENT_DECLINE_RATE_LIMIT_MAX`, `NODE_ANTIBOT_PROVIDER`, etc.) that the limiters read at construction.
- **`tests/support/rate-limit-harness.ts`** — `withReloadedRateLimits` performs the reset-modules + import + env-override dance used by `limitersWithBudget`.
- **`tests/support/stub.ts`** — `asStub` creates the minimal typed object passed into `request.authContext`.

## Notes

- **Module re-evaluation is mandatory.** `rateLimit()` captures its options at construction time. Every test that needs a different budget must call `jest.resetModules()` before re-importing `@modules/payments/rate-limits`. The `afterEach` in each `describe` block enforces this.
- **Gate and limiter must share a module instance.** `paymentDeclineChallengeGate` reads a property name that `paymentConfirmDeclineLimiter` sets on the request. Importing them from separate module instances (e.g., one from `limitersWithBudget`, one from a fresh import) would break the coupling. `appWithBudget` and `blockApp` guard against this by importing both from the same `await import(...)`.
- **All supertest requests originate from one IP.** The address-block tests rely on this shared block; the per-account budget is isolated via the `x-account` header, but the IP-based block is shared across all of them.
- **The confirm-attempt limiter counts every outcome** (success, decline, error), unlike the decline limiter. This is intentional: an attacker can swap cards and retry on the same payment intent.
- **Route ordering is tested elsewhere.** This file asserts the limiters' behavior, not that they are mounted in the correct order on the real route. `payments/tests/unit/routes.test.ts` covers that.
