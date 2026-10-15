---
source: src/modules/orders/domain/timeline.ts
sha256: 987140ba58386f1092461c0199221f24ebbb885caf9724396c46907398377ae3
generated_at: 2026-10-15T11:03:02.464308+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/timeline.ts

## Purpose
Defines **who may see each order-timeline row type** and the **input shape** a row must have when written. By making the audience a required mapping over every `OrderTimelineType`, it guarantees that no timeline type can exist without an explicit visibility decision (buyer, staff, or both).

## Key elements
- **`TimelineAudience`** — Union type `'buyer' | 'staff'`.
- **`TIMELINE_AUDIENCE`** — `Readonly<Record<OrderTimelineType, TimelineAudience>>` mapping every generated enum member to its audience. Exhaustive: a missing or extra key is a compile error.
- **`isBuyerVisible(type)`** — One-liner that returns `true` when the type's audience includes `'buyer'`.
- **`TimelineEntryInput`** — Interface describing one row as `orders` writes it: `type`, optional `actor`, `text`, scalar-only `data`, and `at`.

## Relationships
- **`src/types/index.ts`** — Imports the `OrderTimelineType` enum that drives the `TIMELINE_AUDIENCE` key set.
- **`src/modules/orders/domain/index.ts`** — Barrel re-export; consumers import timeline types through this.
- **`src/modules/orders/presenter.ts`** — Consumes `isBuyerVisible` (or `TIMELINE_AUDIENCE`) to filter rows before rendering to the buyer.
- **`src/modules/orders/services/timeline.ts`** — Writes rows conforming to `TimelineEntryInput`.
- **`src/modules/orders/services/status.ts`** — Emits `TimelineEntryInput` rows (e.g. `status_overridden`, `fulfillment_held`) when status transitions occur.
- **`src/modules/orders/tests/unit/timeline.test.ts`** — Unit tests for the mapping and `isBuyerVisible`.

## Notes
- **Exhaustiveness is enforced at compile time.** Adding a new `OrderTimelineType` to the contract without a corresponding entry in `TIMELINE_AUDIENCE` (and vice-versa) breaks the build.
- **Visibility is a whole-row decision**, not a field-level filter. The doc comment explicitly contrasts this with Magento's `is_visible_on_front` and WooCommerce's `is_customer_note`.
- **`TimelineEntryInput.text`** is reserved for free text that `orders` itself owns (it carries its own retention clock). Sibling-module text must not be placed here.
- **`data` is scalar-only** (`string | number | boolean | null`) to keep rows small and trivially exportable.
- **`actor`** is `string | null | undefined` — `null`/absent means the system acted, not a user.
