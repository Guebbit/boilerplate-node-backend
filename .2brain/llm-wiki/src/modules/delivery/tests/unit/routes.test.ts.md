---
source: src/modules/delivery/tests/unit/routes.test.ts
sha256: bd3d8586abe4d622f6e607a9efa99522888c9e697bce3d4151e79361bcfa2815
generated_at: 2026-09-27T14:52:16.080221+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/routes.test.ts

## Purpose

Unit tests that pin the delivery route table to its documented contract: the exact set and order of endpoints, and the authentication/permission guard attached to each. The file exists so that adding or modifying a route in `routes.ts` without the correct guard is caught immediately rather than discovered in production.

## Key elements

- **`describe('delivery routes')`** — single suite containing eight assertions covering:
  - **Endpoint signature & order** — asserts `routeSignatures(router)` returns the six documented routes in sequence.
  - **Public read (`GET /methods`)** — asserts no `isAuth` guard; shipping costs are pre-purchase info.
  - **Auth-only read (`GET /order/:orderId`)** — asserts `isAuth` present, `requirePermissionGuard` absent.
  - **Operator-gated writes (`POST /order/:orderId/{start,ship,deliver,fulfill}`)** — each asserts `requirePermissionGuard` is present.
  - **Unauthenticated sweep** — filters all routes lacking `isAuth` and asserts the result is exactly `['GET /methods']`. A new route added without any guard fails this assertion.

## Relationships

- **`src/modules/delivery/routes.ts`** — the system under test; this file imports `router` and asserts against its route table and per-route guard array.
- **`tests/support/routes.ts`** — provides the two test helpers used throughout: `routeSignatures(router)` (flat list of `"METHOD /path"` strings) and `guardsOn(router, signature)` (array of guard names on a given route).

## Notes

- Guards are **per-route**, not inherited. The module doc comment explicitly flags this as the arrangement most likely to drift: a new route added to `routes.ts` arrives with no guard unless someone adds one. The sweep test is the safety net for exactly that case.
- The sweep only checks for `isAuth` absence; it does not verify that `requirePermissionGuard` is present on writes. A new write route with `isAuth` but no permission guard would pass the sweep while still being under-restricted.
- Test order matters: the first assertion locks the *order* of routes, so reordering in `routes.ts` breaks this test even if the set is unchanged.
