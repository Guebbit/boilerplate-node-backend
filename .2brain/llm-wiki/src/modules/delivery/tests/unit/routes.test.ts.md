---
source: src/modules/delivery/tests/unit/routes.test.ts
sha256: ae9a5f07cf0ffe5ad00d8d528942850d647832f74505784d882c0b48da14aaaa
generated_at: 2026-11-14T19:55:34.101406+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/routes.test.ts

## Purpose

Unit test suite that locks down the delivery module's route surface: the exact set of endpoints, their mount order, and the authentication/permission guards applied to each. It exists to catch two failure modes — a route silently added without a guard, or a guard silently removed — by asserting the full guard contract rather than individual behaviors.

## Key elements

- **`WRITES`** — constant array listing the seven write endpoints (shipments, fulfill, hold, release, patch shipment, deliver, mark-lost). Drives a `it.each` block that asserts `requirePermissionGuard` on every one.
- **`describe('delivery routes', …)`** — the single suite; contains no nested `describe`. All cases are flat `it` / `it.each` blocks.
- **`it('mounts exactly the documented endpoints…')`** — asserts the full ordered signature list of `router` (14 routes).
- **`it('keeps the shipping methods public')`** — asserts `GET /methods` has no `isAuth` guard.
- **`it.each(['GET /:id/fulfillment-orders', 'GET /:id/shipments'])`** — asserts `orderRouter` routes carry both `isAuth` and `requirePermissionGuard`.
- **`it('mounts the process door and the two lists under /orders…')`** — pins `orderRouter`'s three signatures and the `requirePermissionGuard` on `POST /:id/process`.
- **`it.each(WRITES)`** — each write route must carry `requirePermissionGuard`.
- **`it.each(['release-date-impact', 'restock-date-impact'])`** — asserts both `isAuth` and the exact permission pair `['update:Product', 'display:Order']` on the two preview endpoints.
- **`it('leaves nothing but the methods list unauthenticated')`** — the "sweep": filters every route on `router` for absence of `isAuth` and asserts the only survivor is `GET /methods`.

## Relationships

- **`src/modules/delivery/routes.ts`** — exports `router`, the primary delivery router under test (14 routes).
- **`src/modules/delivery/order-routes.ts`** — exports `orderRouter`, the order-scoped sub-router (3 routes) also asserted here.
- **`tests/support/routes.ts`** — provides the three introspection helpers used throughout: `routeSignatures` (ordered method+path list), `routeTable` (array of route descriptors with `method`, `path`, `permissions`), and `guardsOn` (guard/middleware names attached to a given route).

## Notes

- The module-level JSDoc explicitly warns that per-route guards (rather than a router-level default) are the arrangement most prone to drift; the final "sweep" test is the compensating control.
- Permission assertions on the date-impact routes check the **exact** array `['update:Product', 'display:Order']` via `toEqual`, so adding or reordering a permission on those routes will break the test even if the existing ones are still present.
- `routeTable` is used only in the date-impact test to reach the `permissions` array; `guardsOn` (which reports middleware names) is used everywhere else. The two helpers expose different aspects of a route's security metadata.
