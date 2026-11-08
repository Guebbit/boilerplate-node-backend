---
source: src/modules/orders/tests/unit/service-scope.test.ts
sha256: d87de39b311d510f7915306308da43f71145cc5d0e253545e624c7921c4cc336
generated_at: 2026-11-08T07:14:14.617864+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/service-scope.test.ts

## Purpose

Unit tests for the order-read authorization boundary: `orderService.callerScope`, `orderService.actorOf`, and `orderService.ownLiveScope`. They pin the two critical shapes (unrestricted `{}` vs. fail-closed "matches nothing"), verify that `userId` is a real BSON `ObjectId` (not a string), and lock down how each caller role and edge-case (no auth, empty identity) maps to a concrete query filter.

## Key elements

- **`MATCHES_NOTHING`** — local constant `{ $expr: { $eq: [0, 1] } }`, the canonical CASL `EMPTY_RESULT_QUERY` shape used in assertions.
- **`describe('orderService.callerScope')`** — six tests covering: unrestricted role → `{}`; customer → `{ userId: ObjectId, deletedAt: null }`; soft-delete exclusion; admin seeing soft-deleted rows; `undefined` caller → `MATCHES_NOTHING`; empty-string identity → `MATCHES_NOTHING`.
- **`describe('actorOf')`** — four tests asserting the actor string (`'customer'` | `'admin'`) derived from the caller, including the moderator→`'admin'` case and the no-auth default of `'customer'`.
- **`describe('orderService.ownLiveScope')`** — one test confirming it equals `ownerScope(userId)` spread with `deletedAt: null`.
- **`USER_ID`** — fixed hex string (`'507f1f77bcf86cd799439011'`) shared across all tests.

## Relationships

- **`src/modules/orders/services/index.ts`** — the module under test; `orderService` (with `callerScope`, `actorOf`, `ownLiveScope`, `ownerScope`) is imported directly.
- **`tests/support/callers.ts`** — provides the `asCustomer`, `asAdmin`, and `asModerator` fixture factories that construct typed caller objects for each test case.

## Notes

- **`userId` must be `Types.ObjectId`, not a string.** The file header and the customer-scope test both assert this; `$match` in an aggregation pipeline skips Mongoose schema casting, so a string id silently reads as "no orders" rather than erroring.
- **Unrestricted is `{}`, not `undefined`.** Both spread harmlessly into a query, but the test pins the literal shape so a refactor to `undefined` is caught.
- **Fail-closed on missing identity.** Both `undefined` caller and `asCustomer('')` (empty id) compile to `MATCHES_NOTHING`, not `{}`. The test for empty-string identity explicitly documents that the rule is dropped rather than resolving to `{ userId: null }`, which would match unowned rows.
- **`deletedAt` is a separate axis from `userId`.** The customer scope carries both; the "soft-delete hidden" and "admin sees deleted" tests treat them independently.
- **`actorOf` moderator case is bug-pinning.** The comment notes that `update:Order` is held by name (not via a wildcard), so asking for the wildcard alone would have silently classified a moderator as a customer.
