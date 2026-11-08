---
source: src/modules/delivery/tests/unit/tracking.test.ts
sha256: 0b07df924575cb7e3f084c2e70fa1e3270fa165a54f184660960f0dac31d253b
generated_at: 2026-11-08T05:47:32.887613+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/tracking.test.ts

## Purpose

Unit tests for the `isAwaitingTracking` pure function, which encodes the rule "a physical, still-`shipped` parcel on a tracked method with no tracking code." The file pins down both the positive condition and the full set of boundary cases that must return `false`.

## Key elements

- **`waiting`** — shared minimal fixture: `{ kind: physical, status: shipped }`. Negative cases spread and override individual fields.
- **`describe('isAwaitingTracking')`** — single test suite with:
  - One positive `it` asserting `true` for a physical/shipped parcel on method `'express'` with no code.
  - One `it.each` table (6 rows) asserting `false` for: untracked method (`'standard'`), missing method (`undefined`), unknown method (`'teleport'`), code already present, delivered status, and digital fulfillment kind.

## Relationships

- **`src/modules/delivery/domain/tracking.ts`** — defines `isAwaitingTracking`, the function under test (imported via the domain barrel).
- **`src/modules/delivery/domain/index.ts`** — barrel re-export that the test imports as `../../domain`.
- **`src/types/index.ts`** — source of the `FulfillmentOrderKind` and `ShipmentStatus` enums used to build test fixtures.

## Notes

- The module doc-comment at the top is the authoritative one-line spec for the rule; the test file does not restate the full business context.
- `'express'` is the only method treated as "tracked" in these tests; `'standard'` and `'teleport'` serve as the untracked/unknown counterparts. Adding a new tracked method name to the domain will not be caught here unless a corresponding row is added.
- The `waiting` fixture intentionally omits `trackingCode`; the "code already set" case adds it via spread, so the fixture itself always represents the no-code state.
