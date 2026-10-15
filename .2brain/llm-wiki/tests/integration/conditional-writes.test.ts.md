---
source: tests/integration/conditional-writes.test.ts
sha256: 508795393797e69f5db8f225a02a0e91e75d34d82e826c6030a4ebb6ce38f839
generated_at: 2026-10-15T12:46:30.252753+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/conditional-writes.test.ts

## Purpose

Integration test for optimistic-concurrency (conditional-write) support per RFC 9110 §13.1.1: every versioned resource must return a quoted `ETag` on read, accept `If-Match` on PATCH/PUT/DELETE, and answer **412 PRECONDITION_FAILED** when the row has moved since the caller read it. The test is driven end-to-end through the real HTTP API because the guarantee spans the controller, the repository fence, and the error interpreter simultaneously — a unit test of any single layer cannot prove a stale write did not land.

## Key elements

- **`Resource` (interface)** — Normalises the four versioned resources (product, user, order, caller's own account) into a uniform shape: seed, edit, expected, stored, and optional `readyToDelete`. This is what makes the suite table-driven.
- **`RESOURCES` (array of `Resource`)** — The four concrete resource definitions. Each `edit(n)` writes one unguarded field so no lifecycle rule interferes.
- **`DELETABLE`** — `RESOURCES` minus the caller's own account (which deletes via a separate two-step flow rather than `?hardDelete=true`).
- **`storedRevision(collection, id)`** — Reads `editRevision` straight from the MongoDB collection via `mongoose.connection`, bypassing the API.
- **`etagOf(response)`** — Pulls the `ETag` header from an HTTP response; throws if absent.
- **`describe.each(RESOURCES)` block** — Eight tests per resource: ETag format on read, counter increment, If-Match success + new tag, stale-tag 412, unconditional last-writer-wins, `*` wildcard, invalid-header rejection (garbage / unclosed / weak tag), and concurrent-edits race (exactly one wins).
- **`describe.each(DELETABLE)` block** — Two tests: conditional DELETE with stale tag → 412 + row kept; with current tag → 200 + row gone.
- **`describe('PUT')` block** — Confirms PUT carries the same precondition semantics as PATCH (stale → 412, current → write).

## Relationships

- **`src/infrastructure/persistence/versioning.ts`** — The system under test. The file imports `PreconditionFailedError`, `runWithPrecondition`, `versionOf`, and `etagOf` to understand (and in some assertions mirror) the exact ETag encoding and error contract.
- **`tests/support/http.ts`** — Provides `api()` (Supertest wrapper) and `authenticateAs()` used by every request in the suite.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top-level to create/drop the test database before any test runs.
- **`src/kernel/registry.ts`** — `registerModules` is called in `beforeAll` to wire the locales and products modules into the app under test.
- **`src/modules/locales/module.ts`** / **`src/modules/locales/tests/factories.ts`** — Registered as a dependency module; `givenLocale` is imported (required for module registration to succeed).
- **`src/modules/products/module.ts`** / **`src/modules/products/tests/factories.ts`** / **`src/modules/products/model.ts`** / **`src/modules/products/repository.ts`** — Products are one of the four versioned resources; the model and repository are imported to read stored values and (implicitly) to exercise the product write path.
- **`src/modules/users/model.ts`** / **`src/modules/users/repository.ts`** / **`src/modules/users/tests/factories.ts`** — Same role for the user and account resources.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `forceOrderStatus`, `toOrderItem`, `readOrder` are used to seed and manipulate order rows (orders require cancellation before a hard delete is accepted).

## Notes

- **`setupTestDb()` runs at module scope**, not inside a `beforeAll` hook. Importing the file without a test runner context will attempt a real DB connection.
- **Orders need `readyToDelete`** (`forceOrderStatus(id, 'cancelled')`) before any DELETE test; products and users do not have this guard.
- **The caller's own account** (`/account`) is excluded from the DELETE suite — it uses a two-step confirmation flow rather than `?hardDelete=true`.
- **Invalid `If-Match` values** (`garbage`, `"unclosed`, `W/"1"`) must return 412, **not** be silently ignored as "no precondition." The test explicitly asserts this to guard against a common misread of "missing header."
- **`editRevision` must not appear** in the JSON response body; the test asserts its absence.
- The ETag format is `"<integer>"` (RFC-quoted decimal counter). A weak tag (`W/"1"`) is **not** accepted as a match.
