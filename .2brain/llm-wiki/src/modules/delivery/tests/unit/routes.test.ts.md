---
source: src/modules/delivery/tests/unit/routes.test.ts
sha256: 31ea74307c616a1829e27288ffc6c6bf2af05a9710ab28eec11a78d34d6646e3
generated_at: 2026-11-08T05:47:13.265898+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/routes.test.ts

## Purpose
Unit test that pins the delivery module's route table to its documented shape: exact endpoint list and order, per-route guard assignments, and permission-key pairs. Its most important role is the final "sweep" test, which fails if any route is added without an `isAuth` guard, catching the drift risk called out in the file's module doc comment.

## Key elements
- **`WRITES`** — Array of the seven write-endpoint signatures (shipments, fulfill, hold, release, deliver, lost, PATCH shipment). Used by a `it.each` block that asserts every one carries `requirePermissionGuard`.
- **Route-signature / order test** — Asserts `router` exposes exactly 14 endpoints in a fixed order.
- **Public-methods test** — Asserts `GET /methods` has **no** `isAuth` guard (pre-purchase pricing must be public).
- **Per-order read tests** — `GET /:id/fulfillment-orders` and `GET /:id/shipments` on `orderRouter` must have both `isAuth` and `requirePermissionGuard`.
- **Order-router structure test** — `orderRouter` exposes exactly three routes (`POST /:id/process`, two `GET` lists); the process door requires `requirePermissionGuard`.
- **Date-impact preview tests** — `release-date-impact` and `restock-date-impact` routes must carry `isAuth` **and** the permission pair `update:Product` + `display:Order` (dual-key: editor + order owner).
- **Sweep test** — Filters all router signatures for missing `isAuth`; the only allowed unauthenticated route is `GET /methods`.

## Relationships
- **`src/modules/delivery/routes.ts`** — Source of `router`; the test reads its route table via the shared helpers to verify signatures, guards, and permission entries.
- **`src/modules/delivery/order-routes.ts`** — Source of `orderRouter`; same verification pattern applied to the per-order sub-router.
- **`tests/support/routes.ts`** — Provides `routeSignatures`, `routeTable`, and `guardsOn`, the three helpers that extract metadata from an Express/Connect router so the test can assert without issuing HTTP calls.

## Notes
- Guards are **per-route**, not inherited from a router-level middleware. A new route added to either router has no guard until one is explicitly attached; the sweep test exists to catch exactly that.
- The test checks guard *names* (e.g. `requirePermissionGuard`) and permission *action:subject* pairs, but does not exercise the guard logic itself — that lives in the service/middleware layer.
- Route order is asserted (not just set membership), so reordering routes in `routes.ts` will break this test.
