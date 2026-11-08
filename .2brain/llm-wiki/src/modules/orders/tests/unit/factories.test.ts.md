---
source: src/modules/orders/tests/unit/factories.test.ts
sha256: 1e708fc032e1f2e813d35e64ca704fecbc9b5fa32a3c4d396a317058d3588f37
generated_at: 2026-11-08T07:12:16.609283+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/factories.test.ts

## Purpose

Unit tests for the `makeOrder` fixture builder. They pin down two contracts: (1) the shape of a default order document (identity, required vs. optional fields, type conversions) and (2) how an `OrderSnapshotInput` override is transformed into the stored `product` snapshot embedded in each line item.

## Key elements

- **`HEX` / `PRODUCT`** – Two hardcoded hex strings used as ObjectId inputs in overrides and assertions.
- **`DOG_FOOD`** – The minimal `OrderSnapshotInput` object (`id`, `title`, `price`, `taxRate`) reused across snapshot tests.
- **`describe('makeOrder — identity and defaults')`** – Verifies that a bare `makeOrder()` yields a valid document: a real `ObjectId` for `_id` and `userId`, a hard-coded email, an empty `items` array, omitted optional fields (`shippingMethod`, addresses, `notes`, `deletedAt`), preservation of a `'0.00'` shipping cost, and ISO-string → `Date` conversion for `deletedAt`.
- **`describe('makeOrder — the embedded product snapshot')`** – Verifies the snapshot transformation: `_id` is set (not `id`), `title`/`price` are always present, `quantity` stays on the line not inside the product, unprovided catalogue fields are omitted, `onHand`/`reserved` are type-level excluded (via `@ts-expect-error`), provided catalogue fields are frozen verbatim, snapshot timestamps convert to `Date`, and multi-line orders produce one snapshot per line in order.

## Relationships

- **`src/modules/orders/factories.ts`** – Sole import source. The test exercises `makeOrder` (a factory function) and the `OrderSnapshotInput` type (a compile-time boundary the snapshot test asserts against with `@ts-expect-error`).
- A comment in the `onHand`/`reserved` test points to **`orders/tests/integration/schema-contract.test.ts`** as the file that covers the write-time half (dropping live-stock counters from a live product document). No code import exists here; the relationship is documentary.

## Notes

- The `@ts-expect-error` assertion on `onHand` is a *type-level* proof only: it compiles the object to confirm the key is absent from `OrderSnapshotInput`, then checks at runtime that the key *is* present on the literal (because `@ts-expect-error` suppresses the compile error but still lets the expression run). The *runtime* guarantee that the factory drops such a field is delegated to the integration test.
- Snapshot tests assert `Object.hasOwn(snapshot, 'id') === false` to catch a regression where `applyProductTransform` (referenced in a comment) might leave an `id` key alongside `_id`, which would break invoice product linking.
- All ObjectId checks use `toBeInstanceOf(Types.ObjectId)` rather than string comparison, enforcing that overrides passed as hex strings are coerced, not stored raw.
