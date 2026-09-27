---
source: src/modules/orders/factories.ts
sha256: 0f8ce67b8dc3851efe8b55ee0e92cf995e4f3a9818280aeca91bc6a1585bffd6
generated_at: 2026-09-27T15:10:59.534104+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/factories.ts

## Purpose

Builds an order document (ready for `orderRepository.create`) from caller-supplied overrides. Because an order embeds a **product snapshot** (not a reference) and derives its totals at serialization time, constructing a valid order fixture requires non-trivial mapping — contract ids become ObjectIds, ISO dates become `Date`s, `taxClass` becomes a frozen `taxRate`, and several wire-only fields must be excluded. This file centralises that logic so test fixtures don't repeat it.

## Key elements

- **`OrderSnapshotInput`** — Type for the embedded product snapshot. Requires `id`, `title`, `price`; replaces `taxClass` with `taxRate`; omits `onHand`/`reserved` (no schema path exists for them).
- **`OrderLineInput`** — One order line: a snapshot + `quantity` + optional `locale`. Drops `current`, `taxAmount`, `netAmount` (all derived at serialization).
- **`OrderOverrides`** — What a caller may pin on the parent order. Excludes the three totals and `transferInstructions` (wire-only, never stored). Adds `userId`, `items`, and `transferReference`.
- **`OrderFixture`** — Output type: `Partial<OrderDocument> & { _id: OrderDocument['_id'] }`.
- **`toSnapshot`** *(internal)* — Maps `OrderSnapshotInput` → `FrozenOrderLineProduct`: `id` → `_id` (ObjectId), ISO dates → `Date`, spreads remaining fields through `stripUndefined`.
- **`makeOrder`** — The public builder. Fills identity (`identityOf`), defaults `email` and per-line `locale`, maps items via `toSnapshot`, and passes through all optional columns via `stripUndefined` so "not stated" stays absent.

## Relationships

- **`src/infrastructure/persistence/factories.ts`** — Provides the shared helpers used throughout: `identityOf`, `stripUndefined`, `toDate`, and the `OverridesFor<T>` type utility.
- **`src/infrastructure/i18n/catalog.ts`** (via `src/infrastructure/i18n/index.ts`) — Supplies `getDefaultLocale()`, used as the fallback when a caller omits `locale` on an order line.
- **`src/modules/orders/model.ts`** — Source of `FrozenOrderLineProduct` (the snapshot shape `toSnapshot` produces) and `OrderDocument` (the Mongoose document `makeOrder` targets).
- **`src/types/index.ts`** — Source of the contract types (`Order`, `OrderItem`, `Product`, `Id`) from which the input/override types are derived.
- **`src/modules/orders/tests/factories.ts`** — Downstream re-export/aggregation point for test fixtures that consume `makeOrder`.
- **`src/modules/orders/tests/unit/factories.test.ts`** — Unit tests exercising the builder's mapping and defaulting behaviour.

## Notes

- **Deliberate omissions are load-bearing.** `onHand`, `reserved`, the three totals, and `transferInstructions` are absent not by oversight but because the embedded schema has no path for them (or they are computed at serialization). Pinning them in a fixture would silently drop on write.
- **`status` is pass-through, not defaulted.** The Mongoose model already defaults it to `OrderStatus.pending`; repeating that default here is how the two would drift.
- **Shipping fields are intentionally un-defaulted.** `shippingMethod`, `shippingCost`, `shippingAddress` stay `undefined` unless the caller states them, preserving the distinction between "not chosen" and "free (pickup)".
- **Snapshot timestamps are explicit.** `createdAt`/`updatedAt` from the catalogue row are written into the subdocument to override Mongoose's subdocument auto-stamping (which would otherwise date the snapshot to the order's insert time).
- **`locale` is optional** in `OrderLineInput` (unlike the contract's `OrderItem`) so fixtures need not specify it; `makeOrder` fills in `getDefaultLocale()`.
