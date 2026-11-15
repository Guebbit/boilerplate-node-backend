---
source: src/modules/inventory/tests/unit/routes.test.ts
sha256: dd1a1b96c3eff22baf6ae5069989321c1f76c7b365643a502fe1d12954eae2a2
generated_at: 2026-11-14T20:10:33.309322+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/routes.test.ts

## Purpose

Verifies the inventory module's route table is correctly composed: the right endpoints exist in the documented order, every route is protected by an identity guard followed by a permission guard, and no route is accidentally public. It acts as a structural safety net so that adding or reordering a route requires an explicit test update.

## Key elements

- **`describe('inventory routes')`** — single test suite with three cases:
  - *Exact endpoint list/order* — asserts `routeSignatures(router)` matches the eight expected signatures verbatim.
  - *Guard ordering (per route)* — `it.each` over every signature; asserts `getAuth` is present, its index is ≥ 0, and it appears **before** `requirePermissionGuard`.
  - *No public endpoint* — filters signatures lacking `requirePermissionGuard` and asserts the list is empty. Comment notes this is a positional check: it catches a route mounted above the gate.

## Relationships

- **`src/modules/inventory/routes.ts`** — the unit under test; this file imports its exported `router` instance.
- **`tests/support/routes.ts`** — provides the three introspection helpers used here: `routeSignatures`, `guardsOn`, and `identityGuardIndex`.

## Notes

- The module doc-block states the customer-facing inventory surface is deliberately *not* a route (shoppers see stock via `available` on the product page). Any new route therefore defaults to "staff-only" and must carry both guards.
- The "no public endpoint" test is intentionally written as a positional filter over `guardsOn`, not a simple "all routes have `getAuth`" check — it will fail if a route is inserted above the shared `router.use(getAuth, isAuthOrCredential)` gate.
- Adding or removing a route requires updating **both** the `toEqual` list and the `it.each` array; forgetting one will surface as a mismatch rather than a silent gap.
