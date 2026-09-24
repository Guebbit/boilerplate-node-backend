---
source: src/modules/orders/factories.ts
sha256: 59d76ab2adeeef8a38e127a26e8945e847793f8fc38a4b594b72647417851f46
generated_at: 2026-09-23T19:03:20.403380+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/factories.ts

## Purpose

Test-fixture factory that builds an `OrderDocument` ready for `orderRepository.create`. Because an order embeds a product **snapshot** (no `ref`) and several wire fields (totals, `current`, `transferInstructions`) are derived at serialization rather than stored, this module isolates the mapping from caller-friendly overrides to a storable document, stripping anything the schema has no column for.

## Key elements

- **`OrderSnapshotInput`** – Type for the embedded product snapshot. Requires `id`/`title`/`price`; replaces `taxClass` with a resolved `taxRate`; drops `onHand`/`reserved` (no path in the embedded schema).
- **`OrderLineInput`** – One order line: a `product` snapshot + `quantity` + optional `locale`. Drops `current`, `taxAmount`, `netAmount` (all derived at read time).
- **`OrderOverrides`** – Caller-facing override type. Omits `items` (replaced by `OrderLineInput[]`), the three totals, and `transferInstructions`. Adds `transferReference` for `bank_transfer` fixtures (not part of the `Order` contract).
- **`OrderFixture`** – Output type: `Partial<OrderDocument> & { _id }`, i.e. "an order ready for `orderRepository.create`".
- **`toSnapshot`** _(internal)_ – Converts an `OrderSnapshotInput` to `FrozenOrderLineProduct`: maps `id` → `Types.ObjectId`, ISO strings → `Date`, strips undefined fields.
- **`makeOrder`** _(exported)_ – Builds the full `OrderFixture`. Defaults `email` and per-line `locale`; passes `status` through untouched (the model owns its own `pending` default); wraps optional columns in `stripUndefined` so absent fields stay absent on write.

## Relationships

- **`src/infrastructure/persistence/factories.ts`** – Imports `identityOf`, `stripUndefined`, `toDate`, and the `OverridesFor<T>` helper that `OrderOverrides` and `OrderSnapshotInput` are derived from.
- **`src/infrastructure/i18n/index.ts`** – Imports `getDefaultLocale`, used as the per-line `locale` default in `makeOrder`.
- **`src/infrastructure/i18n/catalog.ts`** – Indirect: `getDefaultLocale` reads the active locale from the i18n catalog this file defines.
- **`src/types/index.ts`** – Imports the domain types `Id`, `Order`, `OrderItem`, `Product` that the local override types are `Omit`-ed from.
- **`src/modules/orders/model.ts`** – Imports `FrozenOrderLineProduct` and `OrderDocument`, the schema-level types that `toSnapshot` and `OrderFixture` target.
- **`src/modules/orders/tests/factories.ts`** – Downstream consumer; re-exports or wraps `makeOrder` for test suites.
- **`src/modules/orders/tests/unit/factories.test.ts`** – Unit tests for the factory itself.

## Notes

- **Snapshot vs. reference:** `product` is embedded data, not an id. A fixture must pass the full snapshot as a value; there is no lazy lookup.
- **Derived fields are intentionally absent:** `totalItems`, `totalQuantity`, `totalPrice`, `current`, `taxAmount`, `netAmount`, and `transferInstructions` have no column. Pinning one in a fixture would silently disappear on write.
- **`status` is not defaulted here:** The Mongoose model carries `default: OrderStatus.pending`. Repeating it in the factory is a drift risk, so `makeOrder` just passes it through.
- **Shipping fields pass through, not defaulted:** All three (`shippingMethod`, `shippingCost`, `shippingAddress`) are optional on the wire. Defaulting them would erase the "not chosen" vs. "free (`pickup`)" distinction.
- **`stripUndefined` is load-bearing:** Because `OrderOverrides` derives from the contract `Order` type, a field can be accepted and then omitted from the write without a type error. `stripUndefined` ensures that "caller didn't set it" maps to "field is absent in the document," not "field is `undefined`."
- **Subdocument timestamps:** `createdAt`/`updatedAt` on the snapshot must be passed explicitly. Mongoose stamps subdocuments on insert regardless of the parent's `timestamps: false`, which would otherwise date the snapshot to the order's creation time rather than the product row's.
