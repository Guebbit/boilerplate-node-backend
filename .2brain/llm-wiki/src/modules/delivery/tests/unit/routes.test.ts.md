---
source: src/modules/delivery/tests/unit/routes.test.ts
sha256: 3a96bf4e311a2c4f115b78f00d57435745545fd242a12ef4b8b6a2521fda0573
generated_at: 2026-10-15T10:29:33.556421+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/routes.test.ts

## Purpose

Unit tests for the delivery route table. Verifies that all mounted endpoints appear in the expected order, that each route carries the correct auth guard (none, `isAuth`, or `requirePermissionGuard`), and that no route ships unauthenticated except `GET /methods`. The "sweep" test at the bottom is the safety net that catches a newly added route with no guard.

## Key elements

- **`WRITES`** — constant array of six `POST`/`PATCH` signatures that mutate fulfillment orders or shipments. Used by the parameterized guard test to assert each one requires `requirePermissionGuard`.
- **`describe('delivery routes')`** — single suite with seven assertions:
  - Exact route-signature list and order (12 routes).
  - `GET /methods` is public (no `isAuth`).
  - `GET /order/:orderId` requires a session but no staff permission.
  - `POST /order/:orderId/start` requires `requirePermissionGuard`.
  - All entries in `WRITES` require `requirePermissionGuard`.
  - `POST /fulfillment-orders/:id/confirm-wait` requires a session but no staff key (buyer-only).
  - Sweep: the only unauthenticated route in the whole table is `GET /methods`.

## Relationships

- **`src/modules/delivery/routes.ts`** — the module under test. Provides the `router` instance whose mounted routes and per-route middleware are inspected by every assertion in this file.
- **`tests/support/routes.ts`** — test utility module (aliased `@tests/routes`). Supplies `routeSignatures(router)` (returns the ordered list of `"METHOD /path"` strings) and `guardsOn(router, signature)` (returns the guard names attached to a given route). All guard and ordering assertions depend on these two helpers.

## Notes

- The file intentionally duplicates the full route-signature list inline rather than importing it from the source module, so a rename or reorder in `routes.ts` produces a clear diff failure here.
- The "sweep" test is the only one that guards against *missing* guards on future routes; the individual tests only protect routes that exist today.
- Guard names are matched by string (`'isAuth'`, `'requirePermissionGuard'`), so a rename of either middleware in the app will break these tests silently-at-first (they'll just fail to find the name).
