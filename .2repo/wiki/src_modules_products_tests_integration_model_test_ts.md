# src/modules/products/tests/integration/model.test.ts

## Purpose

Integration test that verifies the serialization invariant: product responses must never expose Mongoose's `_id` or `__v` fields, regardless of whether the data path goes through a hydrated document (`toJSON`) or a `.lean()` query (plain-object list). It exists to guard against a regression where either path leaks internal MongoDB fields to the API consumer.

## Key elements

- **Module docblock** — states the invariant and notes that `.lean()` bypasses `toJSON`, so the service must apply its own transform (`applyProductTransform`).
- **`describe('product serialization')`** — single suite with three `it` blocks:
  - *hydrated document via `toJSON`* — creates a product through the fixture, calls `product.toJSON()`, asserts `id` is present and `_id`/`__v` are absent from the JSON string.
  - *single lookup via `productService.getById`* — exercises the non-lean service path; asserts the returned document's `toJSON()` shape.
  - *lean list via `productService.search`* — exercises the `.lean()` list path; asserts `id` matches a 24-hex-char pattern and `_id`/`__v` are `undefined` on the raw item.
- **`setupTestDb()`** — called at module top-level to initialize the test database before any test runs.

## Relationships

- **`src/modules/products/service.ts`** — the unit under test. Calls `getById`, `search`, and `callerScope` to exercise both the hydrated and lean serialization paths.
- **`src/modules/products/tests/fixtures.ts`** — provides `createProduct`, the helper used to seed a document in the test DB before each assertion.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, which configures the in-memory/test database connection for the suite.
- **`tests/support/stub.ts`** — provides `asStub`, a type-assertion utility used to cast the `.lean()` item to a plain `Record<string, unknown>` for property checks.

## Notes

- The `.lean()` test does **not** go through `toJSON`; it inspects the raw object returned by the service. The transform that replaces `_id`→`id` and strips `__v` in that path lives in the service layer (referenced in the docblock as `applyProductTransform`), not in this test file.
- `callerScope({ admin: true })` is the required context argument for the service calls; omitting it would likely trigger an authorization failure rather than a serialization issue.
- The module is marked `@module` (not a named export), so it has no public API surface beyond registering the test suite.
