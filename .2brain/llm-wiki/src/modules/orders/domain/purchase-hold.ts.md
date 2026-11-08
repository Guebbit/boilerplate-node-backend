---
source: src/modules/orders/domain/purchase-hold.ts
sha256: a23fec60819190754c884b18d5d9c67eef4a7c7b4943740547f0e1244fc55d7d
generated_at: 2026-11-08T06:49:34.227320+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/purchase-hold.ts

## Purpose
Pure domain logic that computes when an **automatic** purchase hold expires based on a buyer's recent cancellations. All time values (cancellation timestamps, "now", window, limit) are passed in as parameters so the module has no clock or I/O dependency.

## Key elements
- **`AUTOMATIC_PURCHASE_HOLD_MAX_DAYS`** — `const 7`. Hard ceiling (days) on how long an automatic hold may last. Intentionally a constant, not a configuration. Manual holds are not governed by this value.
- **`purchaseHoldUntil(cancelTimes, limit, windowDays, now)`** — Returns a `Date` (the instant the hold ends) or `undefined` if the in-window cancellation count is below `limit`. Internally:
  1. Filters `cancelTimes` to those within `windowDays` of `now`.
  2. Sorts chronologically (`.toSorted`, non-mutating).
  3. If count < `limit` → `undefined`.
  4. Otherwise the hold ends when the `(count − limit + 1)`-th oldest in-window cancellation ages out, **capped** at `now + 7 days`.

## Relationships
- **`src/domain-primitives/time.ts`** — Imports the `DAY_MS` constant used for all millisecond arithmetic.
- **`src/modules/orders/domain/index.ts`** — Barrel file that re-exports this module's public API for the rest of the orders domain.
- **`src/modules/orders/services/purchase-hold.ts`** — Service-layer caller that supplies the real `cancelTimes`, `limit`, `windowDays`, and `Date.now()` and applies the returned hold date (or its absence).
- **`src/modules/orders/tests/unit/purchase-hold.test.ts`** — Unit tests exercising `purchaseHoldUntil` with fixed timestamps (no clock mocking needed, thanks to the pure signature).

## Notes
- `cancelTimes` must already be pre-filtered by the caller to cancellations *after* the most recent hold or staff lift; this function does not do that narrowing itself.
- The 7-day cap means a very large `windowDays` cannot extend the hold beyond one week from `now`; the shorter of the two end-times wins.
- `.toSorted()` (ES 2023) is used rather than `.sort()` to avoid mutating the caller's array; keep the target lib in mind if adjusting tooling.
- The module handles only **automatic** holds. Manual holds and the persistent review flag are out of scope here.
