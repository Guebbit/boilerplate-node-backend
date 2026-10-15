---
source: tests/support/shopper-routes.ts
sha256: 8a83b78d44d667cff9026204fe0ee62fcfd91e500732336f9608f363b2bb9632
generated_at: 2026-10-15T13:02:19.993478+00:00
model: ollama:qwen3.8:27b
---

# tests/support/shopper-routes.ts

## Purpose

Provides a single helper that decides which seeded role (`admin` or `user`) a spec-walking test suite should use when calling an operation. By default the suites act as `admin` so that any refusal originates from the controller itself rather than a permission gate. For the small set of shopper-exclusive routes (basket, wishlist-to-cart, payment card steps) the role flips to `user`, because `admin` has no basket key.

## Key elements

- **`SHOPPER_ROUTE`** (module-private) — A compiled regex matching the three shopper-exclusive path patterns: `/cart`, `/wishlist/{productId}/move-to-cart`, and `/payments/intent` / `/payments/{id}/confirm` / `/payments/{id}/sync`.
- **`roleReaching(operation)`** (exported) — Accepts an object with a `path` property (a subset of `Operation`) and returns `'user'` if the path matches `SHOPPER_ROUTE`, otherwise `'admin'`. This is the only public export.

## Relationships

- **`tests/support/spec-walk.ts`** — Supplies the `Operation` type that `roleReaching` consumes. This file is the sole type import; no runtime coupling.
- **`tests/contract/request-contract.test.ts`**, **`tests/contract/write-methods.test.ts`**, **`tests/integration/malformed-ids.test.ts`** — Spec-walking suites that call `roleReceiving` (via `roleReaching`) to pick the role before dispatching each operation. They rely on the default-to-`admin` behavior so that failures are attributable to controller logic, not authorization.

## Notes

- The regex uses the literal string `{productId}` and `{id}` (braces, not a character class) to match the path templates *as defined in the spec*, not concrete values. If a spec path is ever rewritten (e.g. parameter name changes), `SHOPPER_ROUTE` must be updated in lockstep or those routes will silently be sent as `admin`.
- The three shopper routes are the **only** exceptions; every other operation in the spec is expected to be reachable by `admin`. Adding a new shopper-only endpoint requires extending this regex.
