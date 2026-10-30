---
source: src/modules/delivery/tests/unit/tracking.test.ts
sha256: 988f4a5d00fabb47e11c13c4410f4385b77feea71e51df5d4ea084bf02d368fc
generated_at: 2026-10-29T03:50:44.158347+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/tracking.test.ts

## Purpose

Unit tests for the `isAwaitingTracking` domain rule: a physical parcel that is still in `shipped` status, fulfilled via a tracked method, but has no tracking code yet. The file exists to lock in both the single positive case and the six documented negative cases.

## Key elements

- **`waiting`** — shared fixture (a physical, `shipped` order) reused across most test cases; individual cases spread-override specific fields.
- **`describe('isAwaitingTracking')`** — the sole test suite in the file.
- **Positive `it`** — asserts `isAwaitingTracking(waiting, 'express')` returns `true`.
- **`it.each` (6 rows)** — table-driven negative cases: untracked method (`'standard'`), no method (`undefined`), unknown method (`'teleport'`), code already present, status `delivered`, and `digital` kind.

## Relationships

- **`src/modules/delivery/domain/index.ts`** (imported as `../../domain`) — barrel that re-exports `isAwaitingTracking`, the function under test.
- **`src/modules/delivery/domain/tracking.ts`** — the actual implementation of `isAwaitingTracking` exercised here.
- **`src/types/index.ts`** (imported as `@types`) — provides the `FulfillmentOrderKind` and `ShipmentStatus` enums used to build fixtures and select status/kind values.

## Notes

- The module-level JSDoc block states the business rule in plain English; treat it as the spec the tests encode.
- The path alias `@types` is used for type imports rather than a relative path — follow this convention in sibling tests.
- All negative cases share the single `waiting` fixture; only one field is overridden per row, making it easy to add a new counter-example by appending a row to the `it.each` array.
