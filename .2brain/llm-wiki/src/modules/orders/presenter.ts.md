---
source: src/modules/orders/presenter.ts
sha256: 7880120b9338b06498a48e59cc85bbdb0a6817e7677fea6d9ee884f3964a8107
generated_at: 2026-10-15T11:05:48.788492+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/presenter.ts

## Purpose

Transforms stored Mongoose documents into the public `Order` / `OrderTimelineEntry` wire contracts. It is the single translation point between the persistence layer (`model.ts`) and the API surface, and it enforces audience-based visibility rules (buyer vs. staff) on timeline data.

## Key elements

- **`presentOrder(document: OrderDocument): Order`** — Casts the document's `.toJSON()` output to the `Order` type. The cast is necessary because the Mongoose `toJSON` overload returns a generic shape the compiler cannot narrow to `Order` on its own.
- **`presentTimelineEntry(event: OrderEventDocument, audience: 'buyer' | 'staff'): OrderTimelineEntry`** — Maps a single stored timeline row to the wire shape. Conditionally includes `actor` (staff only) and `text` (only when present).
- **`presentTimeline(events: readonly OrderEventDocument[], audience: 'buyer' | 'staff'): OrderTimelineEntry[]`** — Filters the full event array by audience (staff sees all; buyer only sees rows where `isBuyerVisible(event.type)` is true) and maps each surviving row through `presentTimelineEntry`.

## Relationships

- **`src/types/index.ts`** — Source of the `Order` and `OrderTimelineEntry` wire types that this module produces.
- **`src/modules/orders/model.ts`** — Source of `OrderDocument` and `OrderEventDocument`, the input shapes consumed by every function here.
- **`src/modules/orders/domain/index.ts`** — Provides `isBuyerVisible`, the single visibility predicate used in `presentTimeline` to gate buyer-facing rows.
- **`src/modules/orders/services/scope.ts`** — Downstream consumer; its `withActions` pipeline builds on `presentOrder` to resolve live line data and merge caller permissions.

## Notes

- The `as Order` cast in `presentOrder` is intentional and documented: Mongoose's `Document['toJSON']` overload hides the concrete shape from the type system. The same pattern is used in `products/presenter.ts` (`presentProduct`).
- Audience filtering is two-tiered: *which rows* a buyer sees is decided by `isBuyerVisible` (domain logic in `domain/`), and *which fields* appear on a row are decided inline in `presentTimelineEntry` (e.g. `actor` is stripped for buyers). Do not add further filtering here; extend the domain predicate instead.
- `presentTimeline` preserves stored order; it does not sort.
