---
source: src/modules/cart/tests/integration/checkout-rate-limit.test.ts
sha256: 96a31133788e4bb7d112fa3d35b5dc724def0bfa98a39a6ee1bb9dccbd638c01
generated_at: 2026-10-14T15:14:57.561804+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/checkout-rate-limit.test.ts

## Purpose

Integration test that verifies the per-account checkout rate limiter (`POST /cart/checkout`) over real HTTP. It exercises the limiter with a trivial Express handler rather than the full checkout flow, so the property under test (budget enforcement) is isolated from database I/O. The real-route wiring is covered separately in `routes.test.ts`.

## Key elements

- **`asAccount`** (RequestHandler) – Stub middleware that replaces `getAuth`; reads the account id from the `x-account` header and attaches it as a stubbed `AuthContext` on the request.
- **`attempt(app, account)`** – Sends a single `POST /checkout` via supertest with the given account header; resolves to the response status code.
- **`checkoutApp(limit, status)`** – Builds a minimal Express app: mounts `asAccount`, then the real `checkoutLimiter` (loaded through `withReloadedRateLimits` with a custom `NODE_CHECKOUT_RATE_LIMIT_MAX`), then a no-op handler that returns the supplied `status`.
- **`describe('the checkout budget')`** – Three cases:
  - Returns `429` after an account exhausts its budget (3 → `[201,201,201,429,429]`).
  - A refused checkout (status `409`) still consumes budget (2 → `[409,409,429]`).
  - Budgets are per-account: one account's exhaustion does not block another.

## Relationships

- **`src/modules/cart/rate-limits.ts`** – Dynamically imported inside `checkoutApp` to obtain `checkoutLimiter`; the module is re-evaluated per test via `withReloadedRateLimits` so the env-var budget can vary.
- **`tests/support/rate-limit-harness.ts`** – Provides `withReloadedRateLimits`, which reloads the rate-limits module with overridden environment variables.
- **`tests/support/stub.ts`** – Provides `asStub`, used by `asAccount` to fake an `AuthContext`.
- **`src/types/index.ts` / `src/types/auth-context.ts`** – Supply the `AuthContext` type that the stub conforms to.

## Notes

- `afterEach` calls `jest.resetModules()` so each test gets a fresh module graph; without it, the dynamically imported `rate-limits` module would retain the first test's limiter configuration.
- The test intentionally does **not** hit the real checkout route (no DB, no basket read). The comment in the file header and the `409` case make the contract explicit: the limiter counts *attempts*, not *successful* checkouts.
- The `asAccount` middleware hard-codes `'anonymous'` when the `x-account` header is absent; all tests in this file always supply the header.
