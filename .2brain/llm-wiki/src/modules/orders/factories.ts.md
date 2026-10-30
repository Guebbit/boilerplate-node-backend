---
source: src/modules/orders/factories.ts
sha256: d7f8ea8d701e09e492d3a1f597d1b083bf6febe3a7b2baf1065e2bd2a2ee4bfb
generated_at: 2026-10-29T04:42:22.772683+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/factories.ts

## Purpose

Test-fixture factory that builds a Mongoose-ready `Order` document (an `OrderFixture`) from a caller's partial overrides. It translates contract-level shapes (string IDs, ISO date strings, product snapshots as embedded data) into the persistence shape (`Types.ObjectId`, `Date` objects, embedded `FrozenOrderLineProduct`) so tests can call `orderRepository.create` without hand-assembling documents.

## Key elements

- **`OrderSnapshotInput`** — Type for the product-as-placed snapshot. Drops `onHand`/`reserved` (no path in the embedded schema), replaces `taxClass` with a resolved `taxRate`, requires `id`/`title`/`price`.
- **`OrderLineInput`** — One order line: a `OrderSnapshotInput` product, `quantity`, and an optional `locale`. Derived/derived-on-wire fields (`current`, `taxAmount`, `netAmount`) are excluded.
- **`OrderOverrides`** — What a caller may pin when building an order. Drops `items` (replaced by `OrderLineInput[]`) and the three totals (`totalItems`, `totalQuantity`, `totalPrice`) which are serialization-time derivations, not stored columns.
- **`OrderFixture`** — Output type: `Partial<OrderDocument>` with a required `_id`.
- **`toSnapshot`** — Converts `OrderSnapshotInput` → `FrozenOrderLineProduct`; maps `id` to `Types.ObjectId`, ISO strings to `Date`, strips undefined.
- **`nextOrderNumber`** — Module-level counter producing `1999-NNNNNN` order numbers (see Notes).
- **`makeOrder`** — The exported factory. Destructures `OrderOverrides`, fills identity/defaults, maps items through `toSnapshot`, and returns an `OrderFixture`.

## Relationships

- **`@infrastructure/i18n`** — Imports `getDefaultLocale` to default the `locale` on each order line when the caller omits it.
- **`@infrastructure/persistence/factories`** — Reuses `identityOf`, `toDate`, and the `OverridesFor<T>` helper for id/date coercion and the override-picking pattern.
- **`@infrastructure/object-guards`** — Uses `stripUndefined` to guarantee that unspecified optional fields remain absent in the document rather than being written as `undefined`.
- **`./model`** — Imports `FrozenOrderLineProduct` and `OrderDocument` types that define the embedded schema and the top-level document shape.
- **`@modules/shop`** — Imports `shopCurrency` to supply the default `currency` when the caller does not pin one.
- **`@types`** — Imports `Id`, `Order`, `OrderItem`, `Product` for type derivation of the input/override types.
- **`src/modules/orders/tests/factories.ts`** / **`factories.test.ts`** — Downstream test helpers that consume `makeOrder` and its types.
- **`src/modules/delivery/domain/fulfillment.ts`** / **`fulfillment.test.ts`** — Delivery-fulfilment logic and its tests operate on order lines (backordered quantity, promise dates) that this factory can express.

## Notes

- **Order-number year is 1999 on purpose.** No real order carries that year, so the unique `orderNumber` index never collides between fixtures and live data in the same test run.
- **`status` is intentionally *not* defaulted here.** The Mongoose model already carries `default: OrderStatus.pending`; repeating that default in the factory would create a second source of truth.
- **Shipping/payment fields are pass-through, never defaulted.** This preserves the semantic distinction between "no shipping method chosen" (fields absent) and "pickup" (a real method priced 0). A factory-supplied default would erase that difference.
- **Snapshot timestamps are carried explicitly.** Mongoose subdocuments stamp `createdAt`/`updatedAt` on their own insert regardless of the parent's `{ timestamps: false }`; passing the catalogue row's dates through `toDate` ensures the snapshot is dated to the product row, not to the order's creation.
- **`taxRate` replaces `taxClass`.** An order line freezes the *resolved* VAT rate at placement time; the tax class it originated from is not part of the embedded snapshot.
