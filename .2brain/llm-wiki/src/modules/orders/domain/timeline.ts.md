---
source: src/modules/orders/domain/timeline.ts
source_sha256: e83986e5a40fd42230bd816252e6ed92408a54cd4b2b7474a981ebc8ab490c3c
context_sha256: 8c8e6b8f3569bef8126f9d071add12483794376f99e93f6f32699e9492529f1e
generated_at: 2026-11-22T06:13:40.269755+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/domain/timeline.ts

## Purpose
Defines what an order's timeline may say and to whom. The set of timeline entry types comes from the generated contract; this file adds the audience (`buyer` or `staff`) for each type, so no type can exist without a decision about who reads it. Visibility is decided per type, never by stripping fields at read time: a private row is hidden whole.

## Key elements
- `OrderTimelineType`: union of all entry `type` values, read off `OrderTimelineEntry['type']`.
- `OrderTimelineEntryAudience`: the entry's own `audience` type.
- `TIMELINE_AUDIENCE`: `Readonly<Record<OrderTimelineType, OrderTimelineEntryAudience>>` mapping every type to its audience. Staff-only types include `status_overridden`, `fulfillment_held`/`fulfillment_released`, `address_corrected`, `billing_corrected`, `refund_failed`/`refund_canceled`/`refund_reversed`, `dispute_opened`/`dispute_closed` and `note_added`. All others are `buyer`.
- `isBuyerVisible(type)`: true when the type's audience is `buyer`.
- `BUYER_VISIBLE_TYPES`: array of all buyer-audience types, derived from `TIMELINE_AUDIENCE`. It is what a buyer's timeline query narrows to, so the page and its count contain only visible rows.
- `TimelineEntryInput`: the type for one row as `orders` writes it, from any module. Each member pairs a `type` with exactly that type's `data`, plus optional `actor` (absent for the system), `at` (defaults to the write's own instant) and `text`.
- Internal helper types `VariantOf`, `DataField`, `TextField` and `InputOf` derive the input shape from the generated variants.

## Relationships
- Imports `OrderTimelineEntry` from `@types` (`src/types/index.ts`), the generated contract type that all types here derive from.
- A contract test (`src/modules/orders/tests/contract/timeline-variants.contract.test.ts`) checks that the contract's `OrderTimelineType` schema is split exactly by the variants.
- The neighbors `src/modules/orders/domain/index.ts`, `src/modules/orders/services/timeline.ts`, `src/modules/orders/repository.ts`, `src/modules/orders/presenter.ts`, `src/modules/orders/services/status.ts` and `src/modules/orders/model.ts`, plus `src/modules/orders/tests/unit/timeline.test.ts`, are in the dependency graph. The file's own comments only imply the writer and query roles, and the other links are not visible in this file.

## Notes
- Adding a type to the contract without a `TIMELINE_AUDIENCE` row fails to compile, and so does a row with no type.
- `text` is accepted only on variants that declare it, and only when `orders` owns the text (it has its own retention clock). Ids, codes and numbers go in `data`.
- `data` is required unless the variant's generated `data` is an open index signature (an empty object), in which case it must be omitted.
- `BUYER_VISIBLE_TYPES` uses a cast because `Object.entries` loses the key type.
- `VariantOf` is distributive because `Extract` would return `never` for a variant whose `type` is a subset of a wider enum.
- Some staff-only rows have buyer-facing counterparts. The buyer sees the new address on the order itself, and `invoice_corrected` is buyer-visible while `billing_corrected` is not. `note_added` is readable by the buyer only in their data export.
- The file's header comment points to the `orders` module documentation's "the timeline" section.
