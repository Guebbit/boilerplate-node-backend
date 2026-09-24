---
source: src/modules/orders/tests/unit/service-scope.test.ts
sha256: 282b160e07eea47c2e9aab9db25c9057d9c996a728c2546c64f42292fc54ea0e
generated_at: 2026-09-23T19:15:17.844427+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/service-scope.test.ts

## Purpose

Unit tests for the order-read authorization boundary: `orderService.callerScope` (how a CASL caller compiles into a MongoDB query filter) and `actorOf` (which lifecycle column a caller's identity resolves to). The file exists to lock down the fail-closed semantics — unrestricted reads, scoped reads, and anonymous reads — so a future rule change cannot silently widen what an unauthenticated or mis-identified caller sees.

## Key elements

- **`describe('orderService.callerScope')`** — asserts the compiled filter shape for three caller classes:
  - Unrestricted role → `{}` (not `undefined`).
  - Customer → `{ userId: Types.ObjectId(id), deletedAt: null }`.
  - Anonymous / missing identity → `MATCHES_NOTHING`.
- **`describe('actorOf')`** — asserts the lifecycle-column resolution:
  - Customer → `'customer'`, Admin → `'admin'`, Moderator → `'admin'` (pins a historical mis-read), `undefined` → `'customer'`.
- **`MATCHES_NOTHING`** — local constant `{ $expr: { $eq: [0, 1] } }`, i.e. CASL's `EMPTY_RESULT_QUERY`; the filter that matches zero rows.
- **`USER_ID`** — a fixed 24-char hex string used as the sample ObjectId.
- Imports `orderService`, `actorOf` from `../../services`; `asCustomer`, `asAdmin`, `asModerator` from `@tests/callers`; `Types` from `mongoose`.

## Relationships

- **`src/modules/orders/services/index.ts`** — barrel that re-exports `orderService` and `actorOf`, the two units under test.
- **`src/modules/orders/services/scope.ts`** — implementation of `callerScope`; these tests are its contract.
- **`tests/support/callers.ts`** — provides the `asCustomer` / `asAdmin` / `asModerator` factory helpers that build the caller objects passed into `callerScope` and `actorOf`.

## Notes

- `callerScope` must return a **BSON `ObjectId`** for `userId`, not a raw string — `$match` inside an aggregation pipeline skips Mongoose schema casting, so a string silently yields "no orders" instead of an error. The tests use `Types.ObjectId` explicitly to enforce this.
- The unrestricted shape is asserted as `{}` rather than `undefined`; both spread to no restriction, but the test pins the concrete value so a refactor that returns `undefined` is caught.
- The moderator `actorOf` test documents a real bug: `orders.any.update` is held by literal name, not through the scope wildcard, so asking for the wildcard alone previously resolved a moderator to `'customer'`.
- The file-level JSDoc block (`@module`) is intentionally dense; it serves as the living spec for the two "two shapes worth asserting" invariants and should be read alongside the tests when modifying `scope.ts`.
