# src/modules/orders/fixtures.ts

## Purpose

Builder and type definitions for constructing order fixtures that are ready to pass to `orderRepository.create`. It exists so that tests, demo scripts, and other fixture layers can generate realistic, deterministic order documents without manually assembling Mongo `_id`s, converting ISO dates, or worrying about which fields are stored vs. derived.

## Key elements

- **`OrderSnapshotInput`** — The shape of a product embedded in an order line: a generated `Product` with `id`, `title`, and `price` required. Carries `createdAt`/`updatedAt` explicitly to avoid non-deterministic sub-document timestamps.
- **`OrderLineInput`** — One line of an order: the snapshot input plus `quantity` (and any other `OrderItem` fields except `product`).
- **`OrderOverrides`** — The pin set a caller may supply to `makeOrder`. Deliberately omits `status`, `totalItems`, `totalQuantity`, `totalPrice` (derived at serialization, never stored) and replaces `items` with `OrderLineInput[]`.
- **`OrderFixture`** — The output type: a `Partial<OrderDocument>` with a required `_id`, i.e. what `orderRepository.create` expects.
- **`toSnapshot`** (internal) — Converts an `OrderSnapshotInput` into a `ProductSnapshot` by mapping `id` → `_id` (ObjectId) and ISO strings → `Date`, passing optional fields through `compact`.
- **`makeOrder`** (exported) — The public builder. Accepts an optional `OrderOverrides` object, fills in defaults (e.g. `email: 'test@example.com'`), maps items via `toSnapshot`, and uses `compact` to ensure unspecified optional shipping/notes fields stay absent rather than being written as `undefined`.

## Relationships

- **`src/infrastructure/persistence/fixtures.ts`** — Provides the shared utilities this module composes: `identityOf` (generates `_id` + timestamps), `compact` (strips `undefined` keys), `toDate` (ISO → `Date`), and the `OverridesFor<T>` helper type.
- **`src/modules/orders/model.ts`** — Supplies the `OrderDocument` type that defines the shape of `OrderFixture` and the target schema.
- **`src/modules/products/index.ts`** — Exports the `ProductSnapshot` type used as the return type of `toSnapshot`.
- **`src/types/index.ts`** — Source of the contract-level types (`Id`, `Order`, `OrderItem`, `Product`) that the input/override types derive from.
- **`src/modules/orders/demo.ts`** — Consumer of `makeOrder` to seed demo data.
- **`src/modules/orders/tests/fixtures.ts`** — Re-exports or wraps this module for the test fixture layer.
- **`src/modules/orders/tests/unit/fixtures.test.ts`** — Unit tests that exercise `makeOrder` and the snapshot conversion logic.

## Notes

- The product is embedded as a **value snapshot**, not a reference. The `product` field on an order item holds a copy of the product at time of purchase; there is no `ref` to resolve.
- `createdAt`/`updatedAt` on the snapshot are the *catalogue row's* timestamps, passed through explicitly. Without this, Mongoose sub-document `timestamps: true` behavior would stamp them at insert, making exports non-deterministic.
- Shipping fields (`shippingMethod`, `shippingCost`, `shippingAddress`) are intentionally **not** given defaults. The three-way distinction (absent = pre-checkout order, `pickup` at price 0, paid shipping) must remain representable. `compact` is the mechanism that keeps "not supplied" as truly absent.
- `deletedAt` on the snapshot is passed through via `compact` but the module's doc-block notes it is *deliberately* not required — a catalogue soft-delete carries no meaning for an already-placed order.
