# src/modules/orders/fixtures.ts

## Purpose
Builder and type definitions for constructing order fixtures ready to be passed to `orderRepository.create`. It translates contract-level order data (flat product ids, ISO date strings, wire-shaped items) into the shape MongoDB expects (embedded product snapshots with `ObjectId`s, real `Date` values), filling in identity and safe defaults for anything the caller leaves unstated.

## Key elements
- **`OrderSnapshotInput`** — type for the product data a caller must supply per line; requires `id`, `title`, `price` and accepts any other `Product` field as an override.
- **`OrderLineInput`** — one order line: the snapshot input plus `quantity`.
- **`OrderOverrides`** — the set of fields a caller may pin on the order. Excludes `status`, `totalItems`, `totalQuantity`, `totalPrice` (derived, never stored) and replaces `items` with `OrderLineInput[]`.
- **`OrderFixture`** — the output shape: `Partial<OrderDocument>` with a guaranteed `_id`.
- **`toSnapshot`** (internal) — converts `OrderSnapshotInput` to a `ProductSnapshot` subdocument: `id` → `Types.ObjectId`, dates → `Date`, strips `undefined`.
- **`makeOrder`** (exported) — the main builder. Accepts `OrderOverrides` (defaults to `{}`), returns an `OrderFixture` with identity via `identityOf`, a default `email`, mapped items, and `stripUndefined`-gated optional fields.

## Relationships
- **`src/infrastructure/persistence/fixtures.ts`** — provides `identityOf`, `stripUndefined`, `toDate`, and the `OverridesFor<T>` generic used throughout the type definitions.
- **`src/modules/orders/model.ts`** — source of the `OrderDocument` type that `OrderFixture` extends.
- **`src/modules/products/index.ts`** — exports `ProductSnapshot`, the target shape of `toSnapshot`.
- **`src/types/index.ts`** — source of the contract types `Id`, `Order`, `OrderItem`, `Product` that the local types are derived from.
- **`src/modules/orders/tests/fixtures.ts`** — consumes `makeOrder` to build test datasets.
- **`src/modules/orders/tests/unit/fixtures.test.ts`** — unit-tests the output of `makeOrder`.
- **`src/modules/orders/demo.ts`** — likely calls `makeOrder` to seed demo data.

## Notes
- **Product is embedded, not referenced.** `orderItemSchema` declares `product: productSchema` with no `ref`, so the builder must produce the full snapshot object — it cannot store just an id.
- **Subdocument timestamps are explicit.** Mongoose stamps `createdAt`/`updatedAt` on subdocuments at insert time regardless of the parent schema's `{ timestamps: false }`. `toSnapshot` carries the catalogue row's timestamps through to keep exports deterministic.
- **Totals and status are un-settable.** They are excluded from `OrderOverrides` entirely (not merely optional) because they are derived at serialization time by `applyOrderTransform`; stating them would fabricate a column the API never stores.
- **Shipping fields intentionally have no defaults.** `shippingMethod`, `shippingCost`, and `shippingAddress` pass through via `stripUndefined` so "absent" (pre-checkout orders) is preserved distinctly from `pickup` (a real method priced 0). A builder-supplied default would collapse that distinction.
- **`deletedAt` on the snapshot is pass-through.** A catalogue soft-delete is meaningless for an already-placed order line, but the field is still carried (as `undefined` or a `Date`) so it round-trips through `stripUndefined` without error.
