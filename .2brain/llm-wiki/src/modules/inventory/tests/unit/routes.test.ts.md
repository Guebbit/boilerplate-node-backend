---
source: src/modules/inventory/tests/unit/routes.test.ts
source_sha256: dd1a1b96c3eff22baf6ae5069989321c1f76c7b365643a502fe1d12954eae2a2
context_sha256: e289d09e92be9b3b30ccae64221a5fa17303cb9661ad24c0b6be17107878cdb5
generated_at: 2026-11-22T05:28:39.715611+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/unit/routes.test.ts

## Purpose
Unit tests for the inventory module's route table. They check that every route is staff-only: each sits behind the identity guard (`getAuth` plus an auth-or-credential check) and a `requirePermission` guard. There is no customer-facing inventory route, because shoppers see stock through `available` on the product page. The tests fail if a route is mounted above the guard or loses its permission check.

## Key elements
- **`mounts exactly the documented endpoints, in the documented order`**: asserts `routeSignatures(router)` equals this list, in order:
  - `GET /levels`
  - `GET /levels/:productId`
  - `GET /preorders`
  - `PATCH /levels/:productId`
  - `GET /movements`
  - `POST /levels/:productId/receive`
  - `POST /levels/:productId/adjust`
  - `POST /reservations/sweep`
- **`%s carries an identity guard, then a permission guard`** (`it.each` over the same eight signatures). For each route, it checks that:
  - the guards from `guardsOn` include `getAuth`;
  - `identityGuardIndex` returns a value `>= 0`;
  - the guards include `requirePermissionGuard`;
  - the identity guard comes before `requirePermissionGuard`.
- **`has no public endpoint at all`**: filters the route signatures down to those without `requirePermissionGuard` and expects the result to be `[]`. The inline comment says this is the test that fails if a route is mounted above the gate.

## Relationships
- `src/modules/inventory/routes.ts`: the module under test. The test imports its `router` and inspects it without sending requests.
- `tests/support/routes.ts`: imported as `@tests/routes`. It supplies the router-introspection helpers `routeSignatures`, `guardsOn` and `identityGuardIndex`.

## Notes
- The expected route order is part of the assertion, so adding or reordering routes means updating the list here. The same list is repeated in the `it.each` table, so it must be updated in both places.
- The tests are structural. They check guard names and positions, not what the handlers do or how permissions resolve.
