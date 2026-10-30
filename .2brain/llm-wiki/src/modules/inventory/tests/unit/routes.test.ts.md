---
source: src/modules/inventory/tests/unit/routes.test.ts
sha256: 9cbd4531a16a190cbb20af8e488080a1a080ad767d0500a5f2f052663d9a3aa8
generated_at: 2026-10-29T04:09:08.355726+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/routes.test.ts

## Purpose

Locks in the inventory route table's security contract: every endpoint must sit behind `getAuth` + `requirePermissionGuard`, appear in a fixed order, and no unguarded route may exist. It exists so that accidentally mounting a route above the auth gate, or dropping a `requirePermission` from a mount, is caught immediately rather than leaking stock counters and the ledger to the public.

## Key elements

- **`describe('inventory routes')`** — single suite, three specs:
  - *exact signatures & order* — asserts `routeSignatures(router)` equals the eight documented endpoints in that precise sequence.
  - *per-route guard check* (`it.each`) — for every signature, asserts the guard chain contains `getAuth`, that an identity guard exists, and that it precedes `requirePermissionGuard`.
  - *no public endpoint* — filters signatures whose guard chain lacks `requirePermissionGuard` and asserts the result is empty.
- **Import: `router`** from `@modules/inventory/routes` — the sole production object under test.
- **Import: `routeSignatures`, `guardsOn`, `identityGuardIndex`** from `@tests/routes` — test-support helpers that extract ordered route metadata and per-route guard chains from an Express router.

## Relationships

- **`src/modules/inventory/routes.ts`** — the file under test. This suite imports its exported `router` and makes structural assertions on the route table it builds; no runtime side-effects are triggered.
- **`tests/support/routes.ts`** — provides the three introspection helpers (`routeSignatures`, `guardsOn`, `identityGuardIndex`) used to read route paths and their middleware chains without hitting the HTTP layer.

## Notes

- The module doc-comment states a deliberate design choice: the customer-facing stock view is **not** a route (it lives as `available` on the product page), so this test suite intentionally covers *only* staff endpoints.
- The "no public endpoint" spec is written positionally (filter + empty-array assertion) so a new route added above the guard fails with a clear diff of the offending signatures.
- Guard-order assertion (`identityGuardIndex < indexOf('requirePermissionGuard')`) encodes the requirement that identity resolution runs before the permission check on every route.
