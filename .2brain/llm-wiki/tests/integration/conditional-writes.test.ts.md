---
source: tests/integration/conditional-writes.test.ts
sha256: 439f8a2fbf3dfa903ca290da06a7997f315e1db2efc6188c4e16d6cb38239798
generated_at: 2026-11-08T09:37:05.673049+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/conditional-writes.test.ts

## Purpose

End-to-end integration test for optimistic concurrency control (RFC 9110 §13.1.1): verifies that `ETag` is issued on reads, `If-Match` is enforced on PUT/PATCH/DELETE, a stale tag yields **412 Precondition Failed** with the row unchanged, and concurrent writers are correctly fenced. Exercises all four versioned resources (product, user, order, own account) through the real HTTP API so that controller → repository → error-interpreter interactions are covered together.

## Key elements

- **`Resource` (interface)** — Uniform descriptor for a versioned resource: seed path, edit body, expected value, and a direct-read function for the stored field. Lets one `describe.each` suite drive all four resources identically.
- **`RESOURCES` (array of `Resource`)** — Concrete entries for product, user, order, and the caller's own `/account`. Orders additionally define `readyToDelete` (cancellation via `forceOrderStatus`) because hard-delete requires a terminal status.
- **`storedRevision(collection, id)`** — Reads the `editRevision` counter directly from the Mongoose connection, bypassing the API, to assert the exact increment.
- **`etagOf(response)`** — Extracts the `ETag` header, throwing if absent.
- **Main suite (`describe.each(RESOURCES)`)** — Covers: ETag equals the stored counter (quoted); counter increments by 1 per edit; `If-Match` with current tag writes and returns a *new* tag; stale tag → 412 + row untouched; no header → last-writer-wins; `*` wildcard accepted; malformed values (`garbage`, `"unclosed`, `W/"1"`) → 412 (not silently ignored); two concurrent same-tag PATCHes → exactly one 200, one 412.
- **`DELETABLE` + DELETE suite** — Same precondition checks for `DELETE ?hardDelete=true`; the account resource is excluded (it uses a two-step deletion flow).
- **`describe('PUT')` block** — Confirms PUT on an order obeys the same `If-Match` semantics as PATCH.

## Relationships

- **`src/infrastructure/persistence/versioning.ts`** — Source of `PreconditionFailedError`, `runWithPrecondition`, `versionOf`, and `etagOf` (imported as `etagFor`). This test is the integration-level proof that the module's contract holds end-to-end.
- **`tests/support/http.ts`** — Provides `api()` (supertest wrapper) and `authenticateAs` for issuing authenticated requests.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises a clean in-memory / seeded MongoDB per test run.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds a product row.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds a user row.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, `forceOrderStatus`, `readOrder` seed and manipulate order rows.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale` (imported; likely used in the truncated portion for locale-dependent assertions).
- **`src/modules/products/model.ts`** / **`src/modules/users/model.ts`** — `productModel`, `userModel` used to read back the stored field after an edit and verify the row is unchanged after a 412.
- **`src/modules/products/repository.ts`** / **`src/modules/users/repository.ts`** — Imported; the repository layer is where the precondition check and fence actually execute.

## Notes

- The test deliberately reads `editRevision` **directly from the collection** rather than through the API, because the field is internal and intentionally absent from response bodies (`expect(response.body).not.toHaveProperty('editRevision')`).
- The "caller's own account" resource is seeded as a non-admin `user` and addresses `/account`; it is excluded from the DELETE suite because that endpoint uses a separate two-step confirmation flow.
- Malformed `If-Match` values must produce **412**, not be treated as a missing header. This is a security-relevant contract (a mis-specified tag must not silently disable the precondition).
- The concurrent-edit test fires two PATCHes via `Promise.all` with the **same** previously-read tag and asserts the multiset of statuses is `[200, 412]` — exactly one writer wins.
- Orders require `forceOrderStatus(id, 'canceled')` before a hard-delete will be accepted; the `readyToDelete` hook in the `Resource` interface handles this transparently.
