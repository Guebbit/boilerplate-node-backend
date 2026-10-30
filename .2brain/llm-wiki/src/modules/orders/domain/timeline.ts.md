---
source: src/modules/orders/domain/timeline.ts
sha256: 357b0a7ce1573b7614a33870e8b88fe7233b05d5920f880714dd701cf214085f
generated_at: 2026-10-29T04:40:59.948275+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/timeline.ts

## Purpose

Defines the audience mapping for every order-timeline type and the shape of a timeline entry as written by the `orders` module. Its job is to make the "who can read this row?" decision a compile-time, per-type choice rather than a field-stripping step at read time.

## Key elements

- **`TIMELINE_AUDIENCE`** — `Readonly<Record<OrderTimelineType, OrderTimelineEntryAudience>>`. Exhaustive mapping of every `OrderTimelineType` to `'buyer'` or `'staff'`. Adding a new type to the contract without a row here is a compile error (and vice-versa).
- **`isBuyerVisible(type)`** — Returns `true` when `TIMELINE_AUDIENCE[type] === 'buyer'`. The single predicate other code uses to decide whether a row is buyer-facing.
- **`TimelineEntryInput`** — Interface for one row as `orders` writes it. Fields: `type`, `actor` (nullable), `text` (free text owned by `orders`), `data` (scalar `Record` for type-specific values), `at` (optional timestamp).

## Relationships

- **`src/types/index.ts`** — Source of the `OrderTimelineType` enum and `OrderTimelineEntryAudience` type that this file imports. `TIMELINE_AUDIENCE` is `Record`-keyed over the enum, creating a compile-time exhaustiveness link.
- **`src/modules/orders/domain/index.ts`** — Barrel file that re-exports this module's public surface (`TIMELINE_AUDIENCE`, `isBuyerVisible`, `TimelineEntryInput`) for consumers within the `orders` module.
- **`src/modules/orders/presenter.ts`** — Presumably calls `isBuyerVisible` to filter which rows are returned in a buyer-facing projection.
- **`src/modules/orders/services/status.ts`** and **`src/modules/orders/services/timeline.ts`** — Service-layer writers that construct `TimelineEntryInput` objects when recording status changes or other timeline events.
- **`src/modules/orders/tests/unit/timeline.test.ts`** — Unit tests exercising `TIMELINE_AUDIENCE` completeness and `isBuyerVisible` behavior.

## Notes

- Audience is **per-type, not per-row**. There is no row-level visibility flag; if a type is `'staff'`, *every* row of that type is hidden from the buyer as a whole.
- `TimelineEntryInput.text` is reserved for text that `orders` itself owns (e.g., a staff override reason). Sibling modules' free text must not be placed here — `orders` has its own retention clock on that field.
- `data` is constrained to scalar values (`string | number | boolean`) to keep each row small and trivially exportable.
