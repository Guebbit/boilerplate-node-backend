---
source: src/modules/orders/tests/unit/timeline.test.ts
sha256: 51446c6568924137950872467b38186bfe84a994f7f891dd274b7a62c0b80ca9
generated_at: 2026-11-08T07:14:59.245198+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/timeline.test.ts

## Purpose

Unit test that pins the exact set of timeline event types marked as staff-only (invisible to buyers). The list is hardcoded rather than derived dynamically so that promoting or demoting a type produces a visible, reviewable diff instead of a silent side effect.

## Key elements

- **`TIMELINE_AUDIENCE`** (imported) — the type→audience mapping under test; the single source of truth for which rows a buyer may see.
- **`describe("the timeline audience table")` / `it("keeps exactly these types from the buyer")`** — filters `TIMELINE_AUDIENCE` for entries whose audience is `'staff'`, extracts the type names, sorts them (`.toSorted()`), and asserts equality against a hardcoded 10-item list: `address_corrected`, `dispute_closed`, `dispute_opened`, `fulfillment_held`, `fulfillment_released`, `note_added`, `refund_canceled`, `refund_failed`, `refund_reversed`, `status_overridden`.

## Relationships

- **`src/modules/orders/domain/index.ts`** — barrel re-export; the test imports `TIMELINE_AUDIENCE` through this module (`'../../domain'`).
- **`src/modules/orders/domain/timeline.ts`** — where `TIMELINE_AUDIENCE` is defined; this test reads the value but does not mutate or extend it.

## Notes

- **Completeness is not this test's job.** The module doc explicitly defers "every type in the contract appears in the table" to `contract/timeline-variants.contract.test.ts`. This test only asserts *which* entries are staff-only, not that the set is exhaustive.
- Uses `.toSorted()` (ES2023 immutable sort) rather than mutating `.sort()`; requires a runtime or polyfill that supports it.
- Adding or removing a staff-only type requires updating **both** the domain table and this hardcoded list — the test will fail until the list is amended, making the policy change explicit in the diff.
