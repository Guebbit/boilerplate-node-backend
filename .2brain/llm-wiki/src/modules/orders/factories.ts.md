---
source: src/modules/orders/factories.ts
sha256: d7f8ea8d701e09e492d3a1f597d1b083bf6febe3a7b2baf1065e2bd2a2ee4bfb
generated_at: 2026-11-08T06:52:09.916884+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/factories.ts

## Purpose

Test-fixture factory that builds a MongoDB-ready `OrderDocument` for `orderRepository.create`. It bridges the contract-level `Order` wire type and the stored document, handling the product-snapshot embedding (data, not reference), wire-to-DB conversions (`id` → `ObjectId`, ISO strings → `Date`), and sensible defaults so test callers only pin what they care about.

## Key elements

- **`OrderSnapshotInput`** — Input shape for an embedded product line. Omits `onHand`/`reserved`/`taxClass`; requires `id`, `title`, `price`; adds `taxRate` (the resolved VAT, not the class).
- **`OrderLineInput`** — One order line: `product: OrderSnapshotInput` + `quantity` + optional `locale` (defaults to `getDefaultLocale()`). Drops derived fields `current`, `taxAmount`, `netAmount`.
- **`OrderOverrides`** — What a caller may pin. Derived from `OverridesFor<Order>` with `items` replaced and the three stored totals removed.
- **`OrderFixture`** — Output type: `Partial<OrderDocument> & { _id }`.
- **`toSnapshot`** *(private)* — Maps `OrderSnapshotInput` → `FrozenOrderLineProduct`; converts `id` to `Types.ObjectId`, dates via `toDate`, strips undefined.
- **`nextOrderNumber`** *(private)* — Mints `1999-NNNNNN` numbers from a module-level counter; year 1999 avoids collision with the unique index on real orders.
- **`makeOrder`** *(exported)* — Assembles the full fixture. Fills defaults (`email`, `currency` via `shopCurrency()`, `orderNumber`, per-line `locale`), passes `status` and all shipping/payment fields through unchanged, and applies `stripUndefined` so absent stays absent.

## Relationships

- **`src/modules/orders/model.ts`** — Imports `FrozenOrderLineProduct` and `OrderDocument` (the target document shape and the snapshot subdocument type).
- **`src/infrastructure/persistence/factories.ts`** — Imports `identityOf`, `toDate`, and `OverridesFor` (the shared fixture-building utilities this module builds on).
- **`src/infrastructure/object-guards.ts`** — Imports `stripUndefined` to make pass-through fields truly absent when unspecified.
- **`src/infrastructure/i18n/index.ts`** (barrel → `catalog.ts`) — Imports `getDefaultLocale` for the per-line locale default.
- **`src/modules/shop/index.ts`** (→ `service.ts`) — Imports `shopCurrency` as the default currency.
- **`src/types/index.ts`** — Imports the contract types `Id`, `Order`, `OrderItem`, `Product`.
- **`src/modules/orders/tests/unit/factories.test.ts`** — Unit-tests this module's output.
- **`src/modules/orders/tests/factories.ts`** — Sibling test helper that likely re-exports or composes `makeOrder` for other test suites.
- **`src/modules/delivery/domain/fulfillment.ts`** — Consumes order lines (including `promisedAt`, `promiseDated`, `backorderedQuantity`) that this factory populates.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — May depend on order fixtures built here.

## Notes

- **Snapshot, not reference.** The embedded `orderLineProductSchema` has no `ref`; the product is stored as a value. This is why the factory takes full snapshot data rather than a product id.
- **`taxClass` → `taxRate`.** An order line freezes the *resolved* rate, never the tax class it was derived from. Passing `taxClass` here is a type error.
- **Subdocument timestamps.** Mongoose stamps subdocument `createdAt`/`updatedAt` on insert even when the parent has `{ timestamps: false }`. The factory explicitly carries the catalogue row's dates to prevent the snapshot being re-dated to the order.
- **Totals are never stored.** `totalItems`, `totalQuantity`, `totalPrice` (and per-line `taxAmount`/`netAmount`) are derived at serialization by `applyOrderTransform`. Pinning them in a fixture would be silently dropped on write.
- **`status` is not defaulted here.** The Mongoose model already declares `default: OrderStatus.pending`; the factory passes it through so a single source of truth owns the default.
- **Shipping fields intentionally have no default.** All three (`shippingMethod`, `shippingCost`, `shippingAddress`) stay absent when unstated, preserving the "not chosen" vs. "free/pickup" distinction. `stripUndefined` enforces this.
- **Module-level sequence.** `orderNumberSequence` is not reset between tests; two fixtures in the same test file get distinct numbers, but across test files the counter restarts.
