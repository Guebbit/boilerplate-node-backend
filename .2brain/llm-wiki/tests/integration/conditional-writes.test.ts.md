---
source: tests/integration/conditional-writes.test.ts
sha256: b3b2955f29c3a647bc2a10bf0e0a14b98eb97735f1e9099e11cda9261ae17ce2
generated_at: 2026-11-14T23:11:58.926505+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/conditional-writes.test.ts

## Purpose

Integration test that verifies the full conditional-writes flow (RFC 9110 §13.1.1) across all versioned resources. It asserts that reads emit an `ETag` rooted in the row's `editRevision` counter, that `If-Match` on PATCH/PUT/DELETE gates the write, and that a stale tag yields a `412 PRECONDITION_FAILED` without mutating the row. Because the property spans controller → repository → error-interpreter, it is driven through the real HTTP API rather than unit tests of any single layer.

## Key elements

- **`Resource` interface** – A uniform shape (`seed`, `edit`, `expected`, `stored`, `readyToDelete`, `deleteQuery`) that lets `describe.each` run the same seven test cases against every versioned resource.
- **`RESOURCES` array** – Six entries: a product, a user, an order, the caller's own account (`/account`), a webhook subscription, and a language (locale). Each seeds a row, defines a one-field edit, and reads it back from the Mongoose model.
- **`storedRevision(collection, id)`** – Reads `editRevision` straight from the Mongoose collection to verify the counter without trusting the API response.
- **`etagOf(response)`** – Extracts and asserts the presence of the `ETag` response header.
- **`editPartOf(response)`** – Splits the two-part tag (`"<editRevision>.<digest>"`) and returns the revision number used for comparison.
- **`describe.each(RESOURCES)` block** – Seven `it` cases per resource: ETag presence & correctness, counter increments by 1 per edit, matching tag succeeds and returns a new tag, stale tag → 412 + row unchanged, no header → last-writer-wins, `If-Match: *` accepted, malformed tags (`garbage`, `"unclosed`, `W/"1"`) rejected with 412, and a concurrent-edit race where exactly one of two same-tag writes lands.

## Relationships

- **`src/infrastructure/persistence/versioning.ts`** – Source of the core logic under test: `PreconditionFailedError`, `runWithPrecondition`, `versionOf`, and `etagOf`. The test imports them to understand the tag format and to verify the 412 error type.
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds the product resource; `productModel`/`productRepository` read it back for assertions.
- **`src/modules/users/tests/factories.ts`** – `createUser` seeds the user and account resources; `userModel`/`userRepository` verify edits; `setPassword` (from `src/modules/users/services/credentials.ts`) is available for auth setup.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `forceOrderStatus`, `toOrderItem`, `readOrder` seed and manage the order resource; `orderRepository` provides direct DB access.
- **`src/modules/delivery/services/index.ts`** / **`src/modules/delivery/tests/factories.ts`** – `deliveryService` and `fulfillmentOrdersOf` are imported (likely used in order-state transitions or teardown).
- **`src/modules/locales/tests/factories.ts`** – `givenLocale` seeds the language resource; `localeModel`/`localeRepository` read it back.

## Notes

- The test is deliberately **HTTP-level**: it exercises the controller → repository → error-interpreter chain together, which is why the docstring calls out that a unit test of any one layer is insufficient.
- **Locale is the odd one out**: its URL path uses a tag (`pt-BR`) rather than the Mongoose `_id`, so `seed` maps the path back to the internal id via the factory's return value.
- **Order requires `readyToDelete`** (`forceOrderStatus(id, 'canceled')`) before a DELETE can succeed; the `if-match` and stale-tag tests call it defensively even on PATCH to mirror the delete path's state requirements.
- The `W/"1"` (weak-validator) rejection test guards against a regression where the server might silently treat an unparseable `If-Match` as "no precondition" (i.e., last-writer-wins) instead of answering 412.
- `setupTestDb()` runs at module scope; the test file assumes a fresh Mongoose connection per suite (standard in this repo's test setup).
