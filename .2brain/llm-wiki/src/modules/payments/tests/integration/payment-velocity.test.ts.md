---
source: src/modules/payments/tests/integration/payment-velocity.test.ts
sha256: e968ed79d847b045d4958f5bbcf4f3345f4fc1383e723cddf087b74c847f0b1d
generated_at: 2026-11-08T07:33:29.127638+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/payment-velocity.test.ts

## Purpose

Integration tests for the three rate-limiting layers on `POST /payments/:id/confirm`: the per-account attempt budget, the per-account decline budget, the shared address-block decline budget, and the anti-bot challenge gate. The tests exercise the limiters through trivial Express handlers (not the real `postPaymentConfirm` route) so the property under test—isolation of limiter behavior—isn't confounded by database round trips. The real route's middleware ordering is covered separately in `payments/tests/unit/routes.test.ts`.

## Key elements

- **`asAccount(id)`** — Minimal `RequestHandler` that attaches `request.authContext` (a stub with only `.id`) so the limiters' `accountIdOf` key extraction works.
- **`declineAwareApp(declineLimiter)`** — Builds an Express app whose `/confirm` handler sets `request.paymentConfirmDeclined` based on the request body's `outcome` field (`declined` → `true`, otherwise `false`).
- **`limitersWithBudget(attemptLimit, declineLimit?)`** — Re-imports `@modules/payments/rate-limits` via `withReloadedRateLimits` with custom `NODE_PAYMENT_CONFIRM_RATE_LIMIT_MAX` / `NODE_PAYMENT_DECLINE_RATE_LIMIT_MAX` env values.
- **`appWithBudget(declineLimit)`** — Re-imports the same module instance for both `paymentConfirmDeclineLimiter` and `paymentDeclineChallengeGate` (they must share an instance), then wires them in order on `/confirm`.
- **`blockApp(accountLimit, blockLimit)`** — Re-imports all three limiters plus the gate; varies the account via `x-account` header so the block limiter (keyed by IP) can be tested independently of per-account limits.
- **Test suites** — Four `describe` blocks covering: attempt budget (all outcomes spend it, per-account isolation), decline budget (genuine declines spend it; `order-lost` 409 and successes do not), challenge gate (engages only when a provider is set *and* a prior decline exists), and address-block budget (shared IP pool, independent of per-account limits).

## Relationships

- **`src/modules/payments/rate-limits.ts`** — The module under test. Dynamically imported (after `jest.resetModules()`) to get freshly constructed limiters with the desired budgets. Exports used: `paymentConfirmAttemptLimiter`, `paymentConfirmDeclineLimiter`, `paymentConfirmDeclineBlockLimiter`, `paymentDeclineChallengeGate`.
- **`src/types/auth-context.ts`** — Provides the `AuthContext` type for the `asStub<AuthContext>({ id })` cast, ensuring the stub shape matches what `accountIdOf` expects.
- **`src/types/index.ts`** — Barrel re-export of `AuthContext`; the test imports from `@types` rather than the leaf file.
- **`tests/support/environment.ts`** — `setEnvironment` mutates `process.env` before a module re-import so the limiter constructors pick up the new budget values.
- **`tests/support/rate-limit-harness.ts`** — `withReloadedRateLimits` encapsulates the reset-modules → set-env → dynamic-import → restore-env cycle.
- **`tests/support/stub.ts`** — `asStub` creates a partial object typed against a full interface, used here to build a minimal `AuthContext` with only `.id`.

## Notes

- **Module re-evaluation is mandatory.** `rateLimit()` reads its options once at construction time; changing an env var without re-importing the module has no effect. Every test that needs a non-default budget re-imports the module.
- **Same-instance constraint.** The decline limiter and the challenge gate must be destructured from the *same* module instance because the gate reads a property name the limiter set. `appWithBudget` and `blockApp` enforce this by importing once and destructuring together.
- **Attempt budget counts success; decline budget does not.** The attempt limiter spends on every outcome (a card can be swapped and retried on the same intent). The decline limiter spends only when `request.paymentConfirmDeclined === true`, which the route sets exclusively for genuine provider declines—not for the `order-lost` 409.
- **Single-IP assumption for block tests.** All supertest requests originate from one address, so they share the same block. Per-account isolation is tested by varying the `x-account` header, not the IP.
- **`jest.resetModules()` in every `afterEach`** prevents cross-test contamination of the singleton limiter instances.
