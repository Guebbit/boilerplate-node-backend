---
source: src/modules/orders/tests/unit/timeline.test.ts
source_sha256: 8093cf652d3eb48d691373c7069b77e7129038166cfe2d9b970784a47cb0515c
context_sha256: 1fe7f992c2dfa96ec21462772b5d3585d2465af7055dfbc4aa4c638c498a002a
generated_at: 2026-11-22T06:38:55.937860+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/timeline.test.ts

## Purpose
Unit test that pins down the timeline type → audience table. It asserts exactly which timeline row types are hidden from the buyer (staff-only). The staff-only set is spelled out in the test, so moving a type across the buyer/staff line shows up as an explicit diff rather than a silent side effect.

## Key elements
- `describe('the timeline audience table')` with one test, `keeps exactly these types from the buyer`.
- The test filters `Object.entries(TIMELINE_AUDIENCE)` to entries whose audience is `'staff'`, sorts the type names with `toSorted()`, and compares them with `toEqual` to a hard-coded list of 11 types:
  - `address_corrected`, `billing_corrected`
  - `dispute_closed`, `dispute_opened`
  - `fulfillment_held`, `fulfillment_released`
  - `note_added`
  - `refund_canceled`, `refund_failed`, `refund_reversed`
  - `status_overridden`

## Relationships
- Imports `TIMELINE_AUDIENCE` from `../../domain` (`src/modules/orders/domain/index.ts`). That barrel presumably re-exports it from `src/modules/orders/domain/timeline.ts`, where the table lives.

## Notes
- The test only checks the staff-only subset. It does not check that every type is present, or that the remaining types are buyer-visible. Per the module comment, checking that the table names every type the contract defines is left to a separate contract test.
- Adding a new staff-only type, or changing an existing type's audience, requires updating the expected list here, and the test fails until it is updated.
- The result is sorted before comparison, so the order in `TIMELINE_AUDIENCE` does not matter.
