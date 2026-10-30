---
source: src/modules/orders/tests/unit/timeline.test.ts
sha256: e198401139586d31fe6af9f8b8222863fd3e66c537fe762df71833315c9a8513
generated_at: 2026-10-29T05:01:02.785213+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/timeline.test.ts

## Purpose

Unit test that pins down the buyer-visibility contract for order timeline events. It asserts exactly which `OrderTimelineType` values are hidden from buyers and that the `TIMELINE_AUDIENCE` table covers the full enum with no extras, so any reclassification is caught immediately.

## Key elements

- **`describe('the timeline audience table')`** — the sole test suite in the file.
- **`'keeps exactly these types from the buyer'`** — filters `OrderTimelineType` through `isBuyerVisible`, then asserts the hidden set equals a hard-coded sorted array of nine event types (dispute, fulfillment, refund, and `status_overridden` events).
- **`'decides every type the contract names, and no other'`** — asserts the keys of `TIMELINE_AUDIENCE` (sorted) are identical to the values of `OrderTimelineType` (sorted), guaranteeing no type is unaccounted for.

## Relationships

- **`src/modules/orders/domain/timeline.ts`** — defines `TIMELINE_AUDIENCE` and `isBuyerVisible`, the two symbols under test.
- **`src/modules/orders/domain/index.ts`** — barrel re-export through which the test imports those symbols (`../../domain`).
- **`src/types/index.ts`** — defines the `OrderTimelineType` enum that both the hidden-list assertion and the coverage assertion are built against.

## Notes

- The expected hidden list is written out explicitly (not derived) by design: the module doc states that moving a type across the buyer/staff boundary should appear as a visible diff, not a silent side effect of changing the table.
- Uses `toSorted()` (non-mutating) rather than `sort()`, consistent with the project's functional-style convention.
- The file is a `@module` (no named exports); it registers tests via Jest globals only.
