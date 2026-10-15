---
source: src/modules/orders/tests/unit/timeline.test.ts
sha256: b42b2e1aadd893ccf0fefe3e3cddf1fa8733be1095b7a40406d0b755468c99e1
generated_at: 2026-10-15T11:21:40.816714+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/timeline.test.ts

## Purpose

Unit tests that lock down the timeline audience table: which `OrderTimelineType` values are hidden from buyers and which are visible. They exist to make the buyer/staff visibility boundary an explicit, diffable contract rather than an implicit side effect of domain logic.

## Key elements

- **`describe('the timeline audience table')`** — groups two assertions around the visibility boundary.
- **Test 1: "keeps exactly these types from the buyer"** — filters all `OrderTimelineType` values through `isBuyerVisible` and asserts the hidden set is exactly `fulfillment_held`, `fulfillment_released`, `refund_failed`, `status_overridden`. Adding or removing a hidden type requires editing this list.
- **Test 2: "decides every type the contract names, and no other"** — asserts that `Object.keys(TIMELINE_AUDIENCE)` is a 1:1 set-equality with `Object.values(OrderTimelineType)`, catching both missing entries and stray keys.

## Relationships

- **`src/modules/orders/domain/timeline.ts`** — source of `TIMELINE_AUDIENCE` and `isBuyerVisible`, the two symbols under test (imported via the domain barrel).
- **`src/modules/orders/domain/index.ts`** — barrel file that re-exports the above; the test imports through this path (`../../domain`).
- **`src/types/index.ts`** — defines the `OrderTimelineType` enum (imported as `@types`); the tests iterate its values to derive the hidden set and to check table completeness.

## Notes

- The file's module doc-comment states the design intent: the staff-only set is written out explicitly so that reclassifying a type shows up as a one-line diff in this test rather than a silent behavior change in the domain module.
- Both tests use `toSorted()` (immutable) for deterministic ordering; the comparisons are set-equality, so ordering in the enum definition is irrelevant.
- The `@types` import alias maps to `src/types/index.ts`; no other files in this test need the alias.
