---
source: src/modules/orders/tests/unit/factories.test.ts
sha256: 2bbd83a723de85b54b33efe5e5caeb552ded538fdf5d09f0fd59b7a0fdc068f1
generated_at: 2026-10-15T11:19:31.563443+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/factories.test.ts

## Purpose

Unit tests for the `makeOrder` fixture builder exported from the orders factories module. They pin down the builder's contract: which fields it auto-generates (ObjectIds, email, empty items array), which optional fields it deliberately omits, and how it transforms the embedded product snapshot (renaming `id`→`_id`, freezing supplied catalogue fields, excluding live-stock counters). The file exists so that any regression in the fixture's shape is caught before it corrupts downstream tests that assume a specific document structure.

## Key elements

- **`DOG_FOOD`** – A minimal `OrderSnapshotInput` constant (`id`, `title`, `price`, `taxRate`) used as the canonical product override across most snapshot tests.
- **`HEX` / `PRODUCT`** – Two 24-char hex strings standing in for real MongoDB ObjectIds (order owner and product respectively).
- **`describe('makeOrder — identity and defaults')`** – Seven tests asserting: valid ObjectId for `_id`/`userId`, required email, unique userId per call, string→ObjectId coercion for `userId`, `items` defaults to `[]`, optional fields (`shippingMethod`, `shippingAddress`, `billingAddress`, `notes`, `deletedAt`) are absent rather than null, `shippingCost: 0` is preserved, and ISO-string `deletedAt` becomes a `Date`.
- **`describe('makeOrder — the embedded product snapshot')`** – Eight tests asserting: snapshot is keyed by `_id` (not `id`), `title`/`price` are always present, `quantity` lives on the line item not the snapshot, unprovided catalogue fields (`categories`, `tags`) are omitted, `onHand`/`reserved` are type-rejected via `@ts-expect-error`, supplied catalogue fields are frozen into the snapshot, snapshot timestamps are ISO→Date, and multi-item orders build one snapshot per line in order.

## Relationships

- **`src/modules/orders/factories.ts`** – The sole production import. The test exercises `makeOrder` (the builder function) and references the `OrderSnapshotInput` type to assert what the snapshot override shape accepts and rejects.
- **`mongoose` (external)** – `Types.ObjectId` is imported to assert field types; no Mongoose connection or model is involved.

## Notes

- The tests assert **absence** of optional fields with `Object.hasOwn` rather than checking for `null`/`undefined`. This matters because the Mongoose schema applies its own defaults; the factory must not pre-fill them.
- A `@ts-expect-error` is used deliberately on the `onHand` test to prove the type *excludes* live-stock counters. The comment cross-references `orders/tests/integration/schema-contract.test.ts` for the write-time (runtime) half of that guarantee.
- Many assertions carry inline comments explaining the downstream consumer that breaks if the assertion is removed (aggregation `$match` in `callerScope`, invoice rendering, confirmation email). This is the primary documentation of *why* the contract exists.
- `order.items!` non-null assertions appear because the type allows `items` to be optional, but the default test guarantees it is always `[]` in practice.
