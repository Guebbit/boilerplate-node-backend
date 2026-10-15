---
source: src/modules/orders/factories.ts
sha256: 7a69f0018bbe3bfadf9fd559c2c2b4127b907f49d3e71b9e5022a889187698d1
generated_at: 2026-10-15T11:04:21.557722+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/factories.ts

## Purpose

Test-fixture builder that constructs a complete `OrderDocument` ready for `orderRepository.create`. It exists so tests can pin specific order fields while the factory fills in identity, defaults, and the embedded product snapshot — without ever storing derived values (totals, `transferInstructions`) or catalogue-only fields (`onHand`, `reserved`) that the order schema has no path for.

## Key elements

- **`OrderSnapshotInput`** — Type for a product snapshot as it appears inside an order line. Requires `id`, `title`, `price`; replaces `taxClass` with a resolved `taxRate`; drops `onHand`/`reserved`.
- **`OrderLineInput`** — One order line: the snapshot plus `quantity`. `locale` is optional (defaults to `getDefaultLocale()`). Derived wire fields (`current`, `taxAmount`, `netAmount`) are excluded.
- **`OrderOverrides`** — The caller-facing override type for `makeOrder`. Excludes derived/stored-only fields (`totalItems`, `totalQuantity`, `totalPrice`, `transferInstructions`); adds `transferReference` (not part of the `Order` contract) and replaces `items` with `OrderLineInput[]`.
- **`OrderFixture`** — The return type: `Partial<OrderDocument> & { _id }`, i.e. a document the repository can insert directly.
- **`toSnapshot`** *(internal)* — Converts an `OrderSnapshotInput` into a `FrozenOrderLineProduct`, mapping `id → _id`, ISO strings → `Date`, and stripping undefined keys.
- **`nextOrderNumber`** *(internal)* — Monotonic `{year}-{seq}` counter so two fixtures in the same test run never collide.
- **`makeOrder`** — The main factory. Accepts `OrderOverrides`, fills identity (`_id`, timestamps), defaults `email`/`currency`/`orderNumber`/`locale`, maps items through `toSnapshot`, and passes through all optional fields via `stripUndefined` so "not stated" stays absent rather than becoming `null`.

## Relationships

- **`@infrastructure/i18n`** (`getDefaultLocale`) — Supplies the default `locale` for order lines when the caller omits it.
- **`@infrastructure/persistence/factories`** (`identityOf`, `toDate`, `OverridesFor`) — Reuses the shared identity/timestamp helpers and the `OverridesFor<T>` metatype to derive `OrderSnapshotInput` and `OrderOverrides` from the generated `Product`/`Order` contracts.
- **`@infrastructure/object-guards`** (`stripUndefined`) — Ensures omitted optional fields are absent (not `undefined` keys) in the final document.
- **`@types`** — Imports the contract types `Id`, `Order`, `OrderItem`, `Product`.
- **`./model`** — Imports `FrozenOrderLineProduct` (the embedded schema shape) and `OrderDocument`.
- **`./config`** — Imports `shopCurrency` as the default currency.
- **`./tests/factories.ts`** — Re-exports or consumes this factory for broader test setups.
- **`./tests/unit/factories.test.ts`** — Unit-tests the factory's output shape and defaults.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — Consumes orders built by this factory as input fixtures.

## Notes

- `status` is deliberately **not** defaulted here. The Mongoose model declares `default: OrderStatus.pending`; duplicating that default in the factory is a drift risk. Omit it and the model handles it.
- Shipping fields (`shippingMethod`, `shippingCost`, `shippingAddress`) are passed through with **no** default. A `null`/absent value means "not chosen" (e.g. `pickup`), which is distinct from a zero-cost shipping method. `stripUndefined` preserves that distinction.
- `onHand`/`reserved` are structurally impossible on the embedded product snapshot (the schema has no path for them). Pinning them in a fixture would silently drop on write — they are excluded from the type to prevent that.
- `taxClass` is replaced by `taxRate` in the snapshot: an order line freezes the *resolved* rate at placement time, not the class it was derived from (mirrors `freezeOrderLines` behaviour).
- `orderNumberSequence` is a module-level mutable counter. It is not reset between tests; two factories in the same process will always produce distinct numbers, but the sequence is not shared across processes.
- The file is a **test-only** factory (lives under `src/modules/orders/` but is consumed by test files and other modules' tests). It is not imported by application runtime code.
