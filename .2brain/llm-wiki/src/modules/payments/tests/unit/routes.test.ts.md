---
source: src/modules/payments/tests/unit/routes.test.ts
sha256: e6dc0a3dba1ac36497b02899efdac56348f11aa3811bbdf7b6cf52082c424202
generated_at: 2026-09-23T19:24:47.443135+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/routes.test.ts

## Purpose

Unit test for the payments router (`@modules/payments/routes`). Verifies the security-critical structure of the route table: which routes sit above vs. below the auth wall, which are admin-gated, guard composition on money-moving endpoints, and declaration order that prevents silent route shadowing.

## Key elements

- **`WEBHOOK` / `METHODS` constants** – string identifiers for the two public routes (`POST /webhook`, `GET /methods`) used throughout assertions.
- **`withoutHandler(signature)`** – helper that returns a route's guard list minus its handler, enabling direct array comparison of two routes' guard stacks.
- **`jest.mock` for rate-limit middleware** – replaces the real rate-limiter with `securityMock()` from `@tests/routes` so tests don't depend on live rate-limit infrastructure.
- **`describe('payment routes')` block** – the entire test suite. Key assertions:
    - Exact route signature list and order.
    - Every non-public route carries `isAuth`.
    - Webhook and methods carry **no** auth guard, but webhook carries a `payment-webhook` rate limit.
    - Webhook is index 0 (declared before `router.use(getAuth, isAuth)`).
    - Exactly three admin-guarded routes (refund, offline, order-by-reference), excluding `cart.self.checkout`.
    - `POST /:id/sync` guard list equals `POST /:id/confirm` minus four confirm-specific guards (`payments-confirm-attempts`, `payments-confirm-declines`, `paymentDeclineChallengeGate`, `idempotencyKey`), and both share a non-trivial common prefix.
    - Refund/offline declared before the two-segment `/:id` routes to prevent future shadowing.

## Relationships

- **`src/modules/payments/routes.ts`** – the system under test; this file imports `router` from it and asserts its full guard and ordering contract.
- **`tests/support/routes.ts`** (imported as `@tests/routes`) – provides the inspection utilities (`routeSignatures`, `routeTable`, `guardsOn`) and `securityMock()` used to read and mock the router without invoking middleware.

## Notes

- Guard comparison uses full-array equality (`toEqual`) rather than per-name checks because `requireFreshAuth(…)` is an anonymous closure with no stable name; the `(anonymous)` placeholder in the expected array is intentional.
- The order assertion (webhook at index 0, refund/offline before `/:id` routes) encodes the _mechanism_ of protection: `router.use()` applies to everything declared after it, so a silent re-order breaks auth with no error.
- The `cart.self.checkout` permission key is explicitly excluded from the "admin" set; it is a customer-facing key, not an operator one.
