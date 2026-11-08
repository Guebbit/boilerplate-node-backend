---
source: src/modules/stats/tests/unit/routes.test.ts
sha256: 2fc6284f4511cad7c1de738c2fd4a8b42b5a9fd2c395ec583dc56b99845b91a9
generated_at: 2026-11-08T08:27:18.523768+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/tests/unit/routes.test.ts

## Purpose

Unit test for the stats route table that verifies structural invariants: the exact set of mounted routes, that every route is a read-only `GET`, that each requires an authenticated session, and that every route is guarded by the single `read:Stats` permission. It exists to catch accidental privilege escalation (a route gaining a write action) or route drift (an undocumented endpoint appearing).

## Key elements

- **`jest.mock('@infrastructure/http/middlewares/rate-limit', …)`** — Stubs the rate-limit middleware with `securityMock()` from the shared test-support module so tests never trigger real throttling.
- **`describe('stats routes')`** — Contains three assertions against the imported `router`:
  - *exact signatures* — asserts the router exposes exactly 8 `GET` paths (`/sales`, `/products`, `/products/:productId`, `/categories`, `/payments`, `/operations`, `/customers`, `/pipeline`) in order.
  - *session guard (per route)* — `it.each` over every signature; asserts `isAuth` appears in the guard chain.
  - *single permission rule* — asserts every route's permission list maps to exactly `['read:Stats']` (one entry, no writes).

## Relationships

- **`src/modules/stats/routes.ts`** — The subject under test; the file imports its `router` export and inspects it structurally.
- **`tests/support/routes.ts`** — Supplies the inspection helpers `routeSignatures`, `routeTable`, `guardsOn`, and `securityMock` used to extract route metadata from the Express-style router without issuing HTTP requests.

## Notes

- The mock target (`@infrastructure/http/middlewares/rate-limit`) and its factory (`@tests/routes.securityMock`) are in different packages — this is intentional so the real middleware is never loaded.
- Tests are purely declarative against the router object; no HTTP calls, no database, no supertest. They will not catch handler-logic bugs, only routing/guard misconfiguration.
- The signature list is ordered and exhaustive; adding, removing, or reordering a route in `routes.ts` without updating this file will fail CI.
