---
source: src/modules/payments/tests/unit/routes.test.ts
sha256: 259e9908afe51c6daa78617cdbef20da34ee690ee2e1023dcc1bd67f5f63b719
generated_at: 2026-10-15T11:39:10.060907+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/routes.test.ts

## Purpose

Locks in the security-critical routing decisions of the payments module: which routes sit above vs. below the auth wall, which are admin-only, which share pooled rate-limit budgets, and the declaration order that prevents route shadowing. It exists so that a single mis-ordered `router.use` or a missing guard is caught as a test failure rather than a production incident.

## Key elements

- **`WEBHOOK` / `METHODS`** – Constants (`'POST /webhook'`, `'GET /methods'`) identifying the two routes declared *before* the auth wall.
- **`INTENT_BUDGET`** – The shared rate-limit key (`'payments-intent-sync'`) that `POST /intent` and `POST /:id/sync` both consume.
- **`withoutHandler(signature)`** – Strips the trailing handler from a route's guard list so two routes' guard arrays can be compared with `toEqual`.
- **`jest.mock('@infrastructure/http/middlewares/rate-limit', …)`** – Replaces the real rate-limiter with the test-support security mock so guard names are stable and inspectable.
- **`describe('payment routes', …)`** – The test suite covering: endpoint order, per-route `isAuth` presence/absence, webhook public access, webhook rate-limit key, admin-guarded route set, confirm-vs-sync guard parity, shared intent/sync budget, and refund/offline declaration order relative to `/:id` routes.

## Relationships

- **`src/modules/payments/routes.ts`** – Imports the `router` instance under test; every assertion in this file inspects that router's route table and guard chains.
- **`tests/support/routes.ts`** – Provides the three helpers used to interrogate the router: `routeSignatures` (ordered list of `"METHOD /path"` strings), `routeTable` (array of route objects with `permissionKey`), and `guardsOn` (middleware stack for a given route). Also supplies the `securityMock()` factory used in the `jest.mock` call.

## Notes

- **Order is the mechanism, not just style.** `router.use(getAuth, isAuth)` applies to everything declared after it. The test asserts `WEBHOOK` is at index 0 so a reordering is caught as a test failure, not a silent auth break.
- **Guard comparison is structural, not nominal.** `requireFreshAuth(…)` is a closure with no stable `name`, so the tests compare entire guard arrays via `toEqual` rather than checking for individual string values.
- **`withoutHandler` removes exactly one element.** It assumes the last entry in a route's middleware stack is always the handler; adding middleware after the handler would break the helper silently.
- **The admin-guard assertion excludes shopper keys** (`cart.self.update`, `cart.self.checkout`) explicitly, because those routes are permission-gated but customer-facing, not staff-facing.
