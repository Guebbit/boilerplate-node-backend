---
source: src/modules/orders/factories.ts
sha256: 511e61b4b05f65d5ecf37707c1d27ad35cd45dbec0406f4bfe05e0eb7a5b1fdb
generated_at: 2026-11-14T20:38:09.214142+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/factories.ts

## Purpose

Factory module for constructing order fixtures ready for `orderRepository.create`. It converts API-contract-shaped data (ids as strings, ISO dates, product references) into a Mongoose `OrderDocument` shape with `ObjectId` fields, real `Date` values, and embedded product **snapshots** (value copies, not references). It exists so test code and other builders can create valid order documents without hand-assembling the nested structure or re-deriving serialization-time fields.

## Key elements

- **`OrderSnapshotInput`** — Type for the product snapshot embedded in an order line. Requires `id`, `title`, `price`; replaces `taxClass` with a resolved `taxRate`; omits `onHand`/`reserved` (no path in the embedded schema).
- **`OrderLineInput`** — Type for one order line: a snapshot, `quantity`, and an optional `locale`. Derived totals (`current`, `taxAmount`, `netAmount`) are excluded.
- **`OrderOverrides`** — Type for what a caller may pin on an order. Excludes the three stored-absent totals (`totalItems`, `totalQuantity`, `totalPrice`); replaces `items` with `OrderLineInput[]`.
- **`OrderFixture`** — Output type: `Partial<OrderDocument> & { _id: ... }`.
- **`toSnapshot`** (internal) — Maps `OrderSnapshotInput` → `FrozenOrderLineProduct`, converting `id` to `ObjectId`, ISO strings to `Date` via `toDate`, and dropping absent keys via `stripUndefined`.
- **`nextOrderNumber`** (internal) — Module-level counter producing `1999-000001`-style numbers that cannot collide with real orders on the unique `orderNumber` index.
- **`makeOrder`** (exported) — The main factory. Fills in identity, defaults (`email`, `currency`, `orderNumber`, `locale`), maps items through `toSnapshot`, and passes optional fields through via `stripUndefined`.

## Relationships

- **`@infrastructure/i18n`** — Imports `getDefaultLocale` to default `locale` on each order line when the caller omits it.
- **`@infrastructure/object-guards`** — Imports `stripUndefined` to guarantee that unspecified optional fields are omitted (not written as `null`/`undefined`) on the resulting document.
- **`@infrastructure/persistence/factories`** — Imports `identityOf` (id + timestamp defaults), `toDate` (ISO → `Date`), and the `OverridesFor<T>` helper used to derive the override types.
- **`@types`** — Imports `Id`, `Order`, `OrderItem`, `Product` as the contract types the factory types are derived from.
- **`./model`** (`src/modules/orders/model.ts`) — Imports `FrozenOrderLineProduct` (the embedded schema shape) and `OrderDocument` (the Mongoose document type).
- **`@modules/shop`** — Imports `shopCurrency` to supply a sensible default `currency` when the caller does not pin one.

## Notes

- **Module-level mutable state.** `orderNumberSequence` is a plain counter that resets to `0` on module reload (e.g., across separate test files in Jest). Within a single process, two `makeOrder` calls will never share an `orderNumber`; across processes they could, but the `1999-` prefix makes real-collision practically impossible.
- **`status` is intentionally not defaulted.** The model's own `default: OrderStatus.pending` handles the absent case. Replicating that default here would create two sources of truth.
- **Shipping/payment fields pass through, never default.** All are optional on the wire; a builder-supplied default would erase the distinction between "not chosen" and "free (pickup)". `stripUndefined` ensures absent stays absent.
- **Snapshot timestamps are explicit.** Mongoose stamps subdocuments on insert regardless of the parent's `timestamps: false`. Carrying `createdAt`/`updatedAt` explicitly preserves the *product row's* dates rather than silently stamping them with the order's insert time.
- **No derived totals anywhere.** `totalItems`, `totalQuantity`, `totalPrice`, `taxAmount`, `netAmount`, `current` are all serialization-time derivations (`applyOrderTransform`, `orderTaxBreakdown`). Pinning one in a fixture would be silently dropped on write.
