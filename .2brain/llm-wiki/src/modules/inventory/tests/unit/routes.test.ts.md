---
source: src/modules/inventory/tests/unit/routes.test.ts
sha256: 03477bf5c091687325dc01e82291b8561a1725f3b38ea694d0412904b3edbe4a
generated_at: 2026-10-15T10:37:25.532142+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/routes.test.ts

## Purpose

Unit test that pins the inventory route table to its documented contract: the exact set and order of endpoints, and the per-route guard chain that keeps every route staff-only. It exists so that a mis-ordered mount or a missing `requirePermission` is caught immediately rather than leaking counters and the ledger to unauthenticated callers.

## Key elements

- **`routeSignatures(router)`** – imported from `@tests/routes`; returns the flat list of `"METHOD /path"` strings in mount order.
- **`guardsOn(router, signature)`** – imported from `@tests/routes`; returns the ordered array of guard names applied to a given route.
- **`identityGuardIndex(guards)`** – imported from `@tests/routes`; returns the index of the identity/credential guard in the chain (−1 if absent).
- **`router`** – the Express-style router exported from `@modules/inventory/routes`, the object under test.
- **Test 1** (`mounts exactly the documented endpoints…`) – asserts the full signature list matches the seven expected routes in order.
- **Test 2** (`%s is reachable only by an authenticated admin`) – parameterised over all seven signatures; asserts `getAuth` is present, an identity guard exists at index ≥ 0, `requirePermissionGuard` is present, and the identity guard appears *before* `requirePermissionGuard`.
- **Test 3** (`has no public endpoint at all`) – filters for any route whose guard list lacks `requirePermissionGuard` and expects the result to be empty.

## Relationships

- **`src/modules/inventory/routes.ts`** – sole production dependency; exports the `router` that all three tests inspect.
- **`tests/support/routes.ts`** – provides the three test utilities (`routeSignatures`, `guardsOn`, `identityGuardIndex`) shared across route-table tests in the repo.

## Notes

- The guard-order assertion (identity < `requirePermissionGuard`) is intentional: the permission check must see a resolved identity, so swapping the two would break authorisation.
- Test 3 is deliberately a *positional* check on the full signature list, not just a count — it fails the moment a new route is inserted above the `getAuth`/`isAuthOrCredential` gate.
- The module docstring makes explicit that the customer-facing stock view is **not** a route in this module (it lives on the product page via an `available` field), so the "no public endpoint" invariant is structural, not just a matter of permission logic.
