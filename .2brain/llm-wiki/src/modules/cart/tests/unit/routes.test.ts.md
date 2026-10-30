---
source: src/modules/cart/tests/unit/routes.test.ts
sha256: ec97760e42bf3247e483f995389c4e1dc2ae765841379f444cd4182eccc6d47e
generated_at: 2026-10-29T03:30:56.235296+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/routes.test.ts

## Purpose

Unit test that pins the cart router's public contract: the exact set of routes, their middleware chain (auth → permission → budget → idempotency → cache), and the deliberate *absence* of shared caching. It exists so that adding, reordering, or removing middleware on any cart route breaks CI immediately.

## Key elements

- **`ALL`** — Array of every expected `"METHOD /path"` signature (10 entries). Acts as the single source of truth for the test's "what exists" assertion and is reused by every `it.each` block.
- **"what is mounted" block** — Calls `routeSignatures(router)` and asserts it equals `ALL` in order.
- **"authorization" block** — Asserts every route carries the `isAuth` guard.
- **"who shops" block** — Asserts every route carries `requirePermissionGuard` *after* `isAuth` (session must be proven before the permission is evaluated).
- **"checkout budget" block** — Asserts the `checkout` budget is present only on `POST /checkout`, positioned after the permission guard and before the `idempotencyKey` middleware.
- **"merge" block** — Asserts `POST /merge` carries an `idempotencyKey` and that the `cart-merge` budget is spent *before* idempotency replay.
- **"caching" block** — Asserts `POST /checkout` invalidates `products` cache, and that *no* cart route calls `setCache` (per-caller state must never be shared).

## Relationships

- **`src/modules/cart/routes.ts`** — The module under test. This file imports its exported `router` and inspects its route table and middleware chains.
- **`tests/support/routes.ts`** — Provides the inspection utilities (`routeSignatures`, `guardsOn`, `chainOf`) and the mock factories (`cacheMock`, `securityMock`) that replace the real cache/rate-limit middlewares so the test can read the chain in isolation.

## Notes

- `jest.mock` calls use `jest.requireActual('@tests/routes')` to pull the mock factories from the support module at runtime — the support file must not be itself mocked or circularly imported.
- The "caches nothing" test asserts a *negative* invariant (`cached` array is empty). If a future route adds a `setCache` call, this test is the one that catches it.
- Middleware ordering is asserted via `indexOf` comparisons rather than strict array equality, so new middlewares can be inserted without breaking the test as long as the relative order of the named middleware is preserved.
