---
source: src/modules/orders/tests/unit/service-scope.test.ts
sha256: d87de39b311d510f7915306308da43f71145cc5d0e253545e624c7921c4cc336
generated_at: 2026-10-29T05:00:37.031917+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/service-scope.test.ts

## Purpose

Unit tests for the order-read authorization boundary (`callerScope`) and the helper `actorOf` role classifier. They pin down the exact query shapes each caller role receives, the fail-closed behaviour when identity is absent, and the soft-delete exclusion rule — so that a future change to the scope compiler breaks a named assertion instead of silently widening or narrowing who can read what.

## Key elements

- **`describe('orderService.callerScope')`** — six assertions covering: admin → `{}` (no restriction); customer → `{ userId: ObjectId, deletedAt: null }`; admin sees soft-deleted rows (no `deletedAt` key); `undefined` caller → `MATCHES_NOTHING`; empty-string customer id → `MATCHES_NOTHING`.
- **`describe('actorOf')`** — four assertions confirming the lifecycle column name returned per role (`customer`, `admin`, `admin` for moderator, `customer` fallback for no auth).
- **`describe('orderService.ownLiveScope')`** — asserts it equals `ownerScope` merged with `deletedAt: null`, a single shared spelling across modules.
- **`MATCHES_NOTHING`** — module-level constant `{ $expr: { $eq: [0, 1] } }`, i.e. CASL's `EMPTY_RESULT_QUERY`, used as the expected value for the fail-closed cases.
- **`USER_ID`** — a fixed hex string used across all test fixtures.

## Relationships

- **`src/modules/orders/services/index.ts`** — the module under test. Imports `orderService` and exercises `callerScope`, `actorOf`, `ownLiveScope`, and `ownerScope`.
- **`tests/support/callers.ts`** — provides the `asCustomer`, `asAdmin`, and `asModerator` factory helpers that build the caller-context objects fed into the service methods.

## Notes

- **Two shapes are asserted explicitly, not assumed:** unrestricted scope is `{}` (not `undefined`), and no-identity scope is CASL's `EMPTY_RESULT_QUERY` (not a thrown error). Both are load-bearing for the fail-closed invariant.
- **`userId` must be a BSON `ObjectId`**, not a string. Inside an aggregation `$match`, Mongoose skips schema casting, so a string id silently matches zero rows instead of raising.
- **Moderator → `admin` pin:** `actorOf` for a moderator returns `'admin'` because `update:Order` is held by name rather than through the scope wildcard. The test comment documents this as a past bug it now guards against.
- **`asCustomer('')` is distinct from `asCustomer(USER_ID)`:** an empty-string identity causes the condition's placeholder to be unresolvable, dropping the rule entirely rather than producing `{ userId: null }` (which would match unowned rows).
