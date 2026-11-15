---
source: src/modules/orders/domain/timeline.ts
sha256: cbb43dc9897c4e4df30fcd08a9c08392ad99a744553b26ed065bb55aa4280a26
generated_at: 2026-11-14T20:35:32.237250+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/timeline.ts

## Purpose

Defines the closed set of order-timeline entry types and assigns each one a fixed audience (`buyer` or `staff`). It provides the compile-time guard that no type can exist without an audience decision, and the type-safe input shape (`TimelineEntryInput`) that writers must use when creating a timeline row. Visibility is decided here, up front, rather than by stripping fields at read time.

## Key elements

- **`OrderTimelineType`** — union of every `type` literal across the generated `OrderTimelineEntry` variants.
- **`OrderTimelineEntryAudience`** — the audience literal type drawn from the entry.
- **`TIMELINE_AUDIENCE`** — `Readonly<Record<OrderTimelineType, OrderTimelineEntryAudience>>`; the single source of truth mapping each type to `buyer` or `staff`. A new type added to the contract without a row here is a compile error.
- **`isBuyerVisible(type)`** — predicate that returns a boolean based on whether the row's audience is `'buyer'`.
- **`BUYER_VISIBLE_TYPES`** — `readonly OrderTimelineType[]` of every buyer-visible type; used to narrow buyer-facing queries.
- **`TimelineEntryInput`** — distributive conditional type (`InputOf<OrderTimelineType>`) that pairs a given `type` with exactly that variant's optional `data` shape and (if the variant declares one) an optional `text` field. Accepts `actor`, `at`, and `type` on every row.
- **`VariantOf<T>`, `DataField<T>`, `TextField<T>`** — internal type utilities used to build `InputOf`; not exported.

## Relationships

- **`src/types/index.ts`** — supplies the `OrderTimelineEntry` generated type from which `OrderTimelineType` and `OrderTimelineEntryAudience` are derived.
- **`src/modules/orders/domain/index.ts`** — barrel re-export; consumers import through this rather than the file directly.
- **`src/modules/orders/services/timeline.ts`** — consumes `TimelineEntryInput` for writes and `TIMELINE_AUDIENCE` / `isBuyerVisible` for read-time filtering.
- **`src/modules/orders/repository.ts`** — uses `BUYER_VISIBLE_TYPES` to constrain buyer-facing timeline queries.
- **`src/modules/orders/presenter.ts`** — relies on the audience mapping to decide what to render for the buyer view.
- **`src/modules/orders/services/status.ts`** — writes timeline rows using `TimelineEntryInput`.
- **`src/modules/orders/tests/contract/timeline-variants.contract.test.ts`** — asserts the contract's `OrderTimelineType` schema is split exactly by the variants.
- **`src/modules/orders/tests/unit/timeline.test.ts`** — unit-tests the audience table and input types.

## Notes

- Audience is a per-type constant, **not** a per-row override. A `staff`-audience row is hidden whole; no field-level stripping is performed at read time.
- `TIMELINE_AUDIENCE` is deliberately a `Record` over the generated enum so the compiler enforces exhaustiveness in both directions (missing type → error; orphan row → error).
- `BUYER_VISIBLE_TYPES` requires a `type as OrderTimelineType` cast because `Object.entries` widens keys to `string`.
- `VariantOf` uses a distributive `extends infer` chain rather than `Extract` so it still resolves correctly when a variant's `type` enum is a *subset* of the full union (where `Extract` would yield `never`).
- A variant whose `data` is an open index signature (`{ [key: string]: unknown }`) maps to `{ data?: undefined }` in `TimelineEntryInput`, meaning writers simply omit the field.
- The `text` field is accepted **only** on variants that declare it in their own schema; all other types get `unknown` (i.e. the key is rejected).
