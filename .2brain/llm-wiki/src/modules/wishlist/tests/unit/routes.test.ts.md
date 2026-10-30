---
source: src/modules/wishlist/tests/unit/routes.test.ts
sha256: 07b4280e8b5ec8af547aaaccad688ac268d90c850e016d08e0ce0e81ac5f46cd
generated_at: 2026-10-29T06:36:18.938493+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/unit/routes.test.ts

## Purpose

Unit test that locks down the wishlist router's public contract: the exact set and order of endpoints, the universal authentication requirement, and the single permission-guarded route. It exists so that structural changes to `routes.ts` (new endpoints, reordering, guard changes) are caught immediately and reviewed against the "wishlists are personal, not admin" design intent.

## Key elements

- **`describe('wishlist routes')`** — suite wrapping three assertions on the imported `router`.
- **"mounts exactly the documented endpoints, in the documented order"** — asserts `routeSignatures(router)` equals the four expected signatures in order (`GET /`, `POST /items`, `POST /items/:productId/move-to-cart`, `DELETE /items/:productId`).
- **`it.each([...])('%s requires a session', …)`** — parametrized check that every route carries the `isAuth` guard.
- **"is admin-free by design, and asks a key only where a basket is written"** — filters routes with `requirePermissionGuard` and asserts the sole match is `POST /items/:productId/move-to-cart`.

## Relationships

- **`src/modules/wishlist/routes.ts`** — system under test; the test imports its `router` export and inspects its route table and guard chain.
- **`tests/support/routes.ts`** — provides the two helper functions used throughout: `routeSignatures(router)` (flattens a Hono/Express router into ordered `"METHOD /path"` strings) and `guardsOn(router, signature)` (returns the guard/middleware names attached to a given route).

## Notes

- Route **order** is asserted, not just membership. Inserting a new route between two existing ones will fail this test even if the set is correct.
- The permission-guard test encodes a business rule, not just a code check: the comment states that if an operator/admin view of another user's wishlist ever appears, this test should fail and the addition should be scrutinized.
- `requirePermissionGuard` is the "key" (shopper's basket token) guard — it is distinct from `isAuth` (session). The test confirms the two are not conflated.
