# src/modules/orders/tests/unit/factory.test.ts

## Purpose

Unit tests for `makeOrder`, the order fixture builder. They verify the builder's identity/defaults behavior (real ObjectIds, empty arrays, omitted optionals) and the semantics of the embedded product snapshot that `orderItemSchema` stores.

## Key elements

- **`PANINO`** — the minimal product override (`id`, `title`, `price`) reused as fixture data across snapshot tests.
- **`HEX` / `PRODUCT`** — hardcoded ObjectId hex strings used to assert round-tripping of identifiers.
- **`describe('makeOrder — identity and defaults')`** — asserts that a bare `makeOrder()` produces a valid document: real `Types.ObjectId` for `_id` and `userId`, a default email, an empty `items` array, omission of optional fields, preservation of `shippingCost: 0`, and ISO-string-to-`Date` conversion for `deletedAt`.
- **`describe('makeOrder — the embedded product snapshot')`** — asserts snapshot specifics: `_id` (not `id`) as an `ObjectId`, always-present `title`/`price`, `quantity` living on the line not the product, omission of unspecified catalogue fields, preservation of specified catalogue fields, timestamp conversion, and per-line ordering.

## Relationships

- **Imports `makeOrder` from `@modules/orders/factory`** (`src/modules/orders/factory.ts`) — the unit under test. Every assertion in this file is about the object `makeOrder` returns.
- **Imports `Types` from `mongoose`** — used in `toBeInstanceOf(Types.ObjectId)` assertions to confirm the builder emits real ObjectIds, not hex strings.

## Notes

- The test file's block comment explains *why* the snapshot must key on `_id` rather than `id`: the `applyProductTransform` in the schema renames `_id` on serialization, so a snapshot carrying `id` would lose its identifier entirely. This is a contract between the factory and the schema, not a test-local concern.
- Several assertions check `Object.hasOwn` to confirm fields are **absent** (omitted) rather than present-as-`undefined`. This distinction matters for Mongoose path resolution and for downstream code that branches on presence.
- The `userId` uniqueness test (`String(a) !== String(b)`) guards against a regression where the factory would mint a shared constant instead of a fresh ObjectId per call.
