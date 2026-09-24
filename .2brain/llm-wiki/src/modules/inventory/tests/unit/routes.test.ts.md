---
source: src/modules/inventory/tests/unit/routes.test.ts
sha256: 3dfe575abc6d0fddc348bc1df0d0a6964a9ee7b4d079dfed57e917a91c01b1ac
generated_at: 2026-09-23T18:47:23.976503+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/routes.test.ts

## Purpose

Unit test that pins the inventory module's route table to a documented set of five endpoints and asserts every one is gated behind `getAuth` + `requirePermissionGuard`. It exists to catch the two failure modes the module's security model depends on: a route accidentally mounted above the auth middleware, or a mount losing its permission check — either of which would expose internal counters and the movement ledger to unauthenticated callers.

## Key elements

- **`describe('inventory routes')`** — single test suite; no setup/teardown hooks.
- **`it('mounts exactly the documented endpoints, in the documented order')`** — asserts `routeSignatures(router)` returns the five known signatures in order: `GET /levels`, `GET /movements`, `POST /receipts`, `POST /adjustments`, `POST /reservations/sweep`.
- **`it.each([...])('%s is reachable only by an authenticated admin')`** — for each signature, pulls the guard chain via `guardsOn`, asserts `getAuth` is present, finds the identity guard's index with `identityGuardIndex`, and verifies `requirePermissionGuard` appears *after* that index.
- **`it('has no public endpoint at all')`** — filters all signatures for ones whose guard list lacks `requirePermissionGuard`; expects an empty array. Comment marks this as the "positional" guard against routes mounted above the gate.

## Relationships

- **`src/modules/inventory/routes.ts`** — the system under test. This file imports the `router` export and inspects its mounted routes and middleware chain; it never exercises request/response behavior.
- **`tests/support/routes.ts`** — provides the three helper functions used here: `routeSignatures` (flattens mounted signatures), `guardsOn` (returns the middleware array for a given signature), and `identityGuardIndex` (locates the identity/auth guard within that array).

## Notes

- The module doc comment states the customer-facing "is stock available?" question is intentionally **not** a route in this module — it lives on the product page via an `available` field. Any route added here is staff-only by design.
- The `identityGuardIndex` / ordering assertion is specific: it checks that the permission guard sits *after* the identity guard, not merely that both are present. A reversed order would be a bug this test catches.
- All three tests are purely structural (they inspect the router's mount table and middleware arrays); they do not issue HTTP requests or mock downstream handlers.
