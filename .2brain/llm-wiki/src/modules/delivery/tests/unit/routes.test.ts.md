---
source: src/modules/delivery/tests/unit/routes.test.ts
sha256: b5c540e090d729fa7b1fe8fa42f0a080eaf6a5fd4a992d83cd811e61efded196
generated_at: 2026-10-29T03:50:25.619268+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/routes.test.ts

## Purpose

Unit test suite that pins down the delivery module's route table: the exact set and order of endpoints, and the per-route security guards (authentication and permission checks). It exists to catch the most likely drift — a new route added without a guard — via a final "sweep" assertion that only `GET /methods` remains unauthenticated.

## Key elements

- **`WRITES`** (module-local constant): the seven mutating endpoints (ship, fulfill, hold, release, patch shipment, deliver, lost) used by the operator-permission tests.
- **"mounts exactly the documented endpoints, in the documented order"**: asserts the full 14-entry signature list on `router` matches the expected order.
- **"keeps the shipping methods public"**: asserts `GET /methods` carries no `isAuth` guard.
- **"requires a session and the order key to read %s"**: parameterised over `GET /:id/fulfillment-orders` and `GET /:id/shipments` on `orderRouter`; asserts both `isAuth` and `requirePermissionGuard` are present.
- **"mounts the process door and the two lists under /orders…"**: asserts `orderRouter` has exactly three routes and that `POST /:id/process` requires `requirePermissionGuard`.
- **"restricts %s to an operator"**: iterates `WRITES`; each must carry `requirePermissionGuard`.
- **"asks for the product key AND the order key on the %s preview"**: for `release-date-impact` and `restock-date-impact`, asserts `isAuth` is present and the permission row maps to exactly `['update:Product', 'display:Order']`.
- **"leaves nothing but the methods list unauthenticated"**: the sweep — filters all `router` signatures for those lacking `isAuth` and asserts the result is exactly `['GET /methods']`.

## Relationships

- **`src/modules/delivery/routes.ts`** — source of `router`, the primary delivery router. Every test that inspects signatures, guards, or permission rows reads from this router instance.
- **`src/modules/delivery/order-routes.ts`** — source of `orderRouter` (the per-order sub-router mounted under `/orders/:id`). Tested for its three routes and their guards.
- **`tests/support/routes.ts`** — provides the three test helpers consumed here: `routeSignatures` (flat `METHOD /path` list), `routeTable` (raw route objects with `permissions`), and `guardsOn` (middleware names attached to a given signature).

## Notes

- Guards are intentionally per-route, not inherited from a parent `Router.use`. The module doc comment calls this out as the arrangement "most likely to drift."
- The sweep test is the safety net: any new route added to `router` without `isAuth` will fail it. If you add a legitimately public route, update that expected array.
- The `permissions` assertion uses `row?.permissions` (optional chain) — if the route isn't found, the test fails on the `.toEqual` comparison rather than throwing, which can be slightly confusing when reading failures.
- `WRITES` is not exported; it is scoped to this test file. If the route set in `routes.ts` changes, this list must be kept in sync manually.
