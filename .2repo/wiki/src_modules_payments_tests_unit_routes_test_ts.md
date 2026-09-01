# src/modules/payments/tests/unit/routes.test.ts

## Purpose

Unit tests that pin down the shape of the payments route table: the exact set of endpoints and their order, universal authentication, the single admin-only refund route, and the path-length ordering convention. It exists so that any future route addition or reordering that would silently break these invariants fails immediately.

## Key elements

- **`describe('payment routes')`** — top-level suite; four tests total.
- **"mounts exactly the documented endpoints, in the documented order"** — asserts `routeSignatures(router)` equals the four hardcoded signatures (`POST /intent`, `GET /order/:orderId`, `POST /order/:orderId/refund`, `POST /:id/confirm`).
- **`it.each(routeSignatures(router))('%s requires a session')`** — iterates every route and asserts the `isAuth` guard is present.
- **"admin-guards the refund, and only the refund"** — filters for routes carrying `isAdmin` and asserts the result is exactly `['POST /order/:orderId/refund']`.
- **"declares the refund before the bare /:id route"** — asserts the index of the three-segment refund path is less than the index of the two-segment `/:id/confirm` path, enforcing a longer-path-first ordering convention.

## Relationships

- **`src/modules/payments/routes.ts`** — imports the `router` export; this is the sole system under test.
- **`tests/support/routes.ts`** — imports the `routeSignatures` and `guardsOn` helpers used by every test in this file.

## Notes

- The ordering assertion is forward-looking: today no collision is possible (3-segment vs. 2-segment), but the test encodes the module's stated convention so a future two-segment admin route inserted before the refund would be caught by CI.
- The module docblock frames the business rule: refund is admin-only because it is a self-service *withdrawal*; all other routes are the customer completing their own checkout.
- `routeSignatures` and `guardsOn` are the canonical test helpers for asserting route-table shape across the codebase — new route tests should reuse them rather than introspecting the router directly.
