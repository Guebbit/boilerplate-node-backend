---
source: tests/integration/conditional-writes.test.ts
sha256: 9f2eb25d997c6c73e5c587d73a7346dbd9eee9829b69a94221da6a96cd36dab0
generated_at: 2026-10-29T06:53:59.419685+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/conditional-writes.test.ts

## Purpose

Integration test for the conditional-writes mechanism (RFC 9110 §13.1.1): verifying that GET responses carry an `ETag` derived from the row's `editRevision` counter, that PUT/PATCH/DELETE honour an `If-Match` precondition, and that a 412 is returned (with the row left untouched) when the tag is stale. Because the property spans controller, repository, versioning helper, and error interpreter, the test drives the full HTTP stack rather than unit-testing any single layer.

## Key elements

- **`Resource` interface** — the contract a versioned resource must satisfy to be tested uniformly: seed, edit, expected, stored, optional `readyToDelete`.
- **`RESOURCES` array** — four entries (product, user, order, caller's own account) that plug into `describe.each`.
- **`storedRevision(collection, id)`** — reads `editRevision` straight from the Mongoose collection to assert the stored counter without going through the repository.
- **`etagOf(response)`** — extracts the `ETag` header, throwing if absent.
- **`describe.each(RESOURCES)` block** — tests: ETag issuance, counter increment per edit, successful `If-Match` write, 412 on stale tag, unconditional last-writer-wins without the header, `If-Match: *` wildcard, rejection of malformed tags (`garbage`, `"unclosed`, `W/"1"`), and concurrent-write race (exactly one 200 / one 412).
- **`DELETABLE` + `describe.each(DELETABLE)` block** — conditional DELETE tests (stale tag → 412, current tag → 204), excluding the account resource which uses a separate two-step delete flow.
- **`describe('PUT')` block** — standalone PUT test on an order confirming the same precondition semantics as PATCH.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top-level to reset the database before any test runs.
- **`tests/support/http.ts`** — `api()` and `authenticateAs()` provide the supertest-style HTTP client and bearer-token helpers used in every request.
- **`src/infrastructure/persistence/versioning.ts`** — source of `PreconditionFailedError`, `runWithPrecondition`, `versionOf`, and `etagOf`; the test exercises the observable behaviour of these helpers through HTTP.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds product rows.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds user rows (target user and the caller's own account).
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `forceOrderStatus`, `toOrderItem`, `readOrder` seed and manipulate order rows.
- **`src/modules/products/model.ts`** — `productModel.findById` reads back the stored `tags` field for assertions.
- **`src/modules/users/model.ts`** — `userModel.findById` reads back the stored `username` field.
- **`src/modules/products/repository.ts`**, **`src/modules/users/repository.ts`** — imported as part of the module graph; the test exercises their precondition-checking logic indirectly via the HTTP controllers.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale` imported (used in a portion of the file beyond the visible range, likely to set a locale context for a resource).

## Notes

- `readyToDelete` is needed only for orders (must be cancelled before `hardDelete=true`); the other resources have no such guard.
- The concurrent-write test (`Promise.all` with identical tags) is a race-condition check; it relies on the database-level `editRevision` check being atomic.
- The test asserts `editRevision` is **not** exposed in the response body — it is an internal counter, not part of the public representation.
- The `W/"1"` weak-validator test confirms the server rejects weak ETags in `If-Match`, treating them as unmatched rather than ignoring the header.
