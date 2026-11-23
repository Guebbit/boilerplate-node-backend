---
source: src/modules/delivery/tests/unit/tracking.test.ts
source_sha256: 0b07df924575cb7e3f084c2e70fa1e3270fa165a54f184660960f0dac31d253b
context_sha256: 758681ad76405150c4ba1336848f4ab6923991702c5527c408efb18fbe591792
generated_at: 2026-11-22T05:06:00.963841+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/unit/tracking.test.ts

## Purpose
Unit tests for `isAwaitingTracking`, the rule behind `Shipment.awaitingTracking` and the staff digest row. It pins down when a parcel counts as "awaiting tracking": physical, still `shipped`, on a tracked method, with no tracking code.

## Key elements
- `waiting` — fixture of shipment facts (`kind: physical`, `status: shipped`, no `trackingCode`). It is the one case that waits, and the other cases are built from it by changing one field.
- Positive test — `waiting` with method `'express'` returns `true`.
- `it.each` negative table — each row expects `false`:
  - an untracked method (`'standard'`)
  - no method (`undefined`)
  - an unknown method (`'teleport'`)
  - a `trackingCode` already set (`'TRK-1'`)
  - status `delivered`
  - kind `digital`

## Relationships
- Imports `isAwaitingTracking` from `src/modules/delivery/domain/index.ts`, the domain barrel. The function itself is implemented in `src/modules/delivery/domain/tracking.ts`.
- Imports `FulfillmentOrderKind` and `ShipmentStatus` from `@types`, which resolves to `src/types/index.ts`. They supply the enum values used in the fixtures.

## Notes
- The tests rely on `'express'` being a tracked method and `'standard'` being untracked. That mapping lives in the domain code, not here.
- Each negative row changes exactly one condition, so a failure points to the rule that broke.
- `describe`, `it` and `expect` are used without being imported, so the test runner supplies them as globals.
