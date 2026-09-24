---
source: src/modules/wishlist/tests/unit/routes.test.ts
sha256: 260cfc21814a29938e513794f710e41d2ef1eaedd4f2fe69e69fe4d93e9af3cf
generated_at: 2026-09-23T19:49:27.051235+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/unit/routes.test.ts

## Purpose

Unit test suite that pins down the wishlist route table: exact endpoint signatures, declaration order, authentication requirements, and the absence of admin guards. It exists to catch regressions where a route is added, reordered, or mis-guarded without updating the documented contract.

## Key elements

- **`routeSignatures(router)` assertion** — asserts the router exposes exactly four endpoints in a specific order: `GET /`, `POST /`, `POST /:productId/move-to-cart`, `DELETE /:productId`.
- **`it.each` auth guard check** — iterates over all four signatures and asserts each carries the `isAuth` guard.
- **"admin-free by design" test** — filters `routeSignatures` for any route bearing `requirePermissionGuard` and asserts the result is empty. Acts as a canary: introducing an operator/admin view of a user's wishlist will fail this test.
- **Order assertion** — verifies `/:productId/move-to-cart` appears in the path list _before_ `/:productId`, preventing the literal string `"move-to-cart"` from being captured as a product id.

## Relationships

- **`src/modules/wishlist/routes.ts`** — the system under test; this file imports its `router` export and inspects it via the helpers below.
- **`tests/support/routes.ts`** — provides the three inspection helpers used throughout: `routeTable` (raw path/method/guard list), `routeSignatures` (formatted `"METHOD /path"` strings), and `guardsOn` (guard names attached to a given signature).

## Notes

- The ordering constraint is the primary reason this file exists. The docblock at the top of `routes.ts` and this test are the only two places documenting that `move-to-cart` must precede the bare `/:productId` route; a silent reordering breaks both.
- The "admin-free" test is intentionally a _negative_ assertion. It is not testing that some guard is present—it is testing that a specific guard is _absent_ on every route. If you add a legitimate admin endpoint to the wishlist module, this test must be updated deliberately.
- All guards are checked by name (`'isAuth'`, `'requirePermissionGuard'`), not by behavior. Renaming a guard upstream will break these tests without changing runtime behavior.
