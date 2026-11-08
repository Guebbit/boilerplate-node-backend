---
source: src/modules/cart/tests/integration/checkout-rate-limit.test.ts
sha256: 96a31133788e4bb7d112fa3d35b5dc724def0bfa98a39a6ee1bb9dccbd638c01
generated_at: 2026-11-08T05:20:10.587930+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/checkout-rate-limit.test.ts

## Purpose

Integration test for the per-account checkout rate limiter (`POST /cart/checkout`). It exercises the limiter against a trivial Express handler rather than the real checkout route, because the property under test (budget enforcement per account) belongs to the limiter itself and routing through the real handler would only add a database round trip per attempt. Route-mounting is covered separately in `routes.test.ts`.

## Key elements

- **`asAccount`** – Express `RequestHandler` that reads the `x-account` header and attaches a stub `AuthContext` (via `asStub`) to `request.authContext`, standing in for the real `getAuth` middleware.
- **`attempt(app, account)`** – Sends a single `POST /checkout` with the given account header via supertest; resolves to the response status code.
- **`checkoutApp(limit, status)`** – Builds a one-route Express app. Dynamically imports `rate-limits` through `withReloadedRateLimits` with `NODE_CHECKOUT_RATE_LIMIT_MAX` overridden to `limit`, extracts `checkoutLimiter`, and mounts it before a handler that returns the fixed `status`.
- **`describe('the checkout budget', …)`** – Three test cases:
  - Budget of 3 → first three attempts get 201, subsequent get 429.
  - Budget of 2 with a 409 handler → refused (409) attempts still consume budget, third gets 429.
  - Budget of 1 → account `"one"` is exhausted while account `"two"` still succeeds, confirming per-account isolation.

## Relationships

- **`src/modules/cart/rate-limits.ts`** – The module under test. Imported dynamically inside `checkoutApp` so `withReloadedRateLimits` can reload it with a custom `NODE_CHECKOUT_RATE_LIMIT_MAX`; the `checkoutLimiter` export is the middleware under test.
- **`src/types/auth-context.ts`** – Source of the `AuthContext` type that `asAccount` stubs onto the request.
- **`src/types/index.ts`** – Barrel through which `AuthContext` is type-imported (`import type { AuthContext } from '@types'`).
- **`tests/support/rate-limit-harness.ts`** – Provides `withReloadedRateLimits`, which performs the `jest.resetModules()` + env-override + dynamic-import cycle needed to get a fresh limiter instance with a specific budget.
- **`tests/support/stub.ts`** – Provides `asStub<AuthContext>`, a minimal typed object used in place of a real auth payload.

## Notes

- `afterEach` calls `jest.resetModules()` explicitly; without it the dynamic import in `checkoutApp` would cache the first `rate-limits` instance and ignore subsequent env overrides.
- The test deliberately does **not** hit the real checkout handler—no DB, no stock service. If the limiter is moved or renamed, only this file and `routes.test.ts` need updating.
- `asAccount` sets `request.authContext` as a plain property (not via `res.locals`), matching what the limiter reads. If the real auth middleware stores the context differently, the limiter must read the same location.
