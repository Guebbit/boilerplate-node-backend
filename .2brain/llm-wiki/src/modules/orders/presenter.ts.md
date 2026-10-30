---
source: src/modules/orders/presenter.ts
sha256: bfd3720cdf9eb02e17f315a09beec2c37a70fbb73c026d9dc144b941a86d165b
generated_at: 2026-10-29T04:44:09.412277+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/presenter.ts

## Purpose

The single presentation layer that converts order storage documents into the wire-format `Order` contract and its timeline entries. It exists so that callers (services, routes) never shape raw Mongo documents by hand; this file is the one place the storage model becomes the API-facing type.

## Key elements

- **`presentOrder(document: OrderDocument): Order`** — Returns `document.toJSON()` cast to the `Order` contract. The cast is required because the Mongoose schema's `toJSON` overload does not resolve to this module's `Order` type.
- **`presentTimelineEntry(event: OrderEventDocument, reader: 'buyer' | 'staff'): OrderTimelineEntry`** — Formats one stored event row for the given audience. `actor` is included only when `reader === 'staff'` **and** the document carries one; `text` is included only when truthy (conditional spread keeps the wire shape clean).
- **`presentTimeline(events: readonly OrderEventDocument[], reader: 'buyer' | 'staff'): OrderTimelineEntry[]`** — Filters the full event list by audience (staff: all rows; buyer: only rows where `isBuyerVisible(event.type)` is true), then maps each through `presentTimelineEntry`.

## Relationships

- **`src/modules/orders/domain/index.ts`** — Imports `TIMELINE_AUDIENCE` and `isBuyerVisible`, used for the `audience` field and the buyer-visibility filter respectively. (The symbols are defined in `domain/timeline.ts` and re-exported through the domain barrel.)
- **`src/modules/orders/model.ts`** — Imports the `OrderDocument` and `OrderEventDocument` types that this presenter consumes.
- **`src/types/index.ts`** — Source of the `Order` and `OrderTimelineEntry` wire types that this module produces.
- **`src/modules/orders/services/actions.ts`** — The module docblock notes that `withActions` (in `services/scope.ts`) builds on this presenter's output, resolving each line's live state and merging caller-permitted actions into the result.

## Notes

- The `as Order` cast in `presentOrder` is intentional and necessary: the compiler cannot see through the Mongoose schema's `toJSON` overload to reach the `Order` contract. The same pattern is documented in `products/presenter.ts`.
- `presentTimelineEntry` uses conditional spreads (`...(reader === 'staff' && event.actor ? … : {})`) so that absent fields are **omitted** from the JSON rather than emitted as `undefined`, keeping the wire payload minimal.
- Buyer visibility is determined solely by `event.type` via the `isBuyerVisible` predicate from the domain module; the presenter does not inspect `event.data` or any other field for the filter.
