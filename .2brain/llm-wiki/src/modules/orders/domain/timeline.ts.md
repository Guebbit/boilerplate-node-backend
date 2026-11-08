---
source: src/modules/orders/domain/timeline.ts
sha256: 75efb077afa3da0b9984f3248e9c39719655a09abda1f50ce000182c5b57ecda
generated_at: 2026-11-08T06:50:39.549247+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/timeline.ts

## Purpose

Defines the audience (buyer vs. staff) for every timeline entry type and derives the per-type write-input shape from the generated contract. It exists so that the "who can see this row" decision is made once, at the type level, rather than by stripping fields at read time — a new timeline type cannot compile without an explicit audience assignment.

## Key elements

- **`OrderTimelineType`** — type alias: `OrderTimelineEntry['type']`; the full union of entry types from the contract.
- **`OrderTimelineEntryAudience`** — type alias: the `audience` field's union (`'buyer' | 'staff'`).
- **`TIMELINE_AUDIENCE`** — `Readonly<Record<OrderTimelineType, OrderTimelineEntryAudience>>` mapping every type to its audience. Compile-time exhaustive: omitting a type is a type error.
- **`isBuyerVisible(type)`** — convenience check: `TIMELINE_AUDIENCE[type] === 'buyer'`.
- **`TimelineEntryInput`** — the public write-input type. A discriminated union where each member carries `type`, optional `actor`/`at`, the variant-specific `data`, and (only for variants that declare it) an optional `text` field.
- **`VariantOf<T>`, `DataField<TVariant>`, `TextField<TVariant>`, `InputOf<T>`** — internal helpers that decompose the generated `OrderTimelineEntry` union to build `TimelineEntryInput` without restating any field.

## Relationships

- **`src/types/index.ts`** — provides `OrderTimelineEntry`, the generated contract type from which all aliases and shapes here are derived.
- **`src/modules/orders/domain/index.ts`** — domain barrel; re-exports this module's public symbols.
- **`src/modules/orders/services/timeline.ts`** — service layer that writes timeline rows; consumes `TimelineEntryInput` as its input contract.
- **`src/modules/orders/presenter.ts`** — presentation layer; uses `isBuyerVisible` / `TIMELINE_AUDIENCE` to filter rows before rendering.
- **`src/modules/orders/model.ts`** — order model; may reference timeline entries and their types.
- **`src/modules/orders/services/status.ts`** — status transitions that emit timeline entries (e.g., `status_overridden`, `fulfillment_held`).
- **`src/modules/orders/tests/unit/timeline.test.ts`** — unit tests for audience mapping and `isBuyerVisible`.
- **`src/modules/orders/tests/contract/timeline-variants.contract.test.ts`** — asserts the contract's `OrderTimelineType` enum splits exactly across variants.

## Notes

- Audience is a **whole-row** decision (per the doc comment, analogous to Magento's `is_visible_on_front`), not a per-field filter. A staff row is hidden entirely from the buyer.
- `note_added` is staff-audience, but the doc comment notes the buyer can still see it in their **data export** — the audience here governs the in-app timeline, not every surface.
- `VariantOf` deliberately avoids `Extract` because `Extract` would return `never` when a variant's `type` enum is a strict subset of a wider union; the conditional-type distributive pattern handles that case.
- The `data` field is optional (`{ data?: undefined }`) only when the generated variant's `data` is an open index signature (`string extends keyof Data`); otherwise it is required and typed to the variant's exact shape.
- Free-text (`text`) is only accepted on variants that explicitly declare it — there is no generic "any type can carry text" escape hatch.
