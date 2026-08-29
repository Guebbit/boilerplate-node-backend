# src/modules/orders/factory.ts

## Purpose

Factory for building order fixtures (seed/test data). It encodes the key domain rule that an order embeds a **product snapshot** as a value rather than a reference, and it deliberately excludes fields that are derived at serialization time (`totalItems`, `totalQuantity`, `totalPrice`, `status`) or semantically irrelevant to a historical line item (`deletedAt`).

## Key elements

- **`OrderSnapshotInput`** — Type for the product-as-of-purchase: `OverridesFor<Product>` with `id`, `title`, `price` made required.
- **`OrderLineInput`** — A single order line: everything in `OrderItem` except `product`, plus a snapshot-typed `product`.
- **`OrderOverrides`** — What a caller may pin when building an order; drops the wire-only totals and `status`, replaces `items` with `OrderLineInput[]`.
- **`OrderFixture`** — The return type: `Partial<OrderDocument>` plus a required `_id`, ready for `orderRepository.create`.
- **`toSnapshot`** *(internal)* — Converts `OrderSnapshotInput` → `ProductSnapshot`, mapping `id` → `_id` (ObjectId), ISO strings → `Date`, and stripping `deletedAt`.
- **`makeOrder`** — The public factory. Accepts `OrderOverrides`, returns an `OrderFixture`. Defaults `email` to `'test@example.com'`, maps each line's product through `toSnapshot`, and passes optional shipping/notes fields through via `compact` so `undefined` stays absent in the document.

## Relationships

- **`src/infrastructure/persistence/factory.ts`** — Supplies the shared helpers `identityOf`, `compact`, `toDate`, and the `OverridesFor` utility type used throughout this file.
- **`src/modules/orders/model.ts`** — Provides the `OrderDocument` type (Mongoose document shape) that `OrderFixture` is built against.
- **`src/modules/products/index.ts`** — Source of the `ProductSnapshot` type that `toSnapshot` returns.
- **`src/types/index.ts`** — Source of the contract types `Id`, `Order`, `OrderItem`, `Product` used in the type definitions.
- **`src/modules/orders/demo.ts`** — Downstream consumer that calls `makeOrder` to assemble the demo dataset.
- **`src/modules/orders/tests/factory.ts`** — Unit tests exercising `makeOrder` and the snapshot/override types.

## Notes

- **`compact` is load-bearing for correctness.** Shipping fields, `notes`, and `deletedAt` are passed through `compact` so that `undefined` values are omitted from the stored document. Without it, an explicit `undefined` would be written as a key, erasing the distinction between "not chosen" and "free shipping" (`pickup`).
- **Nested timestamps.** `productSchema` declares `timestamps: true`; a subdocument is stamped on insert even when the parent save uses `{ timestamps: false }`. That's why `createdAt`/`updatedAt` must be explicitly carried in `OrderSnapshotInput` — otherwise every snapshot would claim the product was created at seed time, breaking byte-stability of exported datasets.
- **No `deletedAt` in the snapshot.** Copying the catalogue row's soft-delete flag into a historical line item would make a completed order appear retracted. `toSnapshot` strips it.
- **Totals are intentionally absent from fixtures.** They are derived by `applyOrderTransform` at serialization; including them in a fixture would invent a stored column that the API never produced.
