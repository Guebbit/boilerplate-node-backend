---
source: src/modules/orders/tests/unit/purchase-hold.test.ts
sha256: 51a278288db53dd8e252747fe4a6c8cab84880e5b6c37cbc0cd591ea403d1627
generated_at: 2026-11-08T07:13:29.730430+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/purchase-hold.test.ts

## Purpose

Unit tests for the pure domain function `purchaseHoldUntil`, verifying the rule that a buyer's own cancellations trigger a purchase hold when their count within a sliding window meets or exceeds a threshold. All tests are deterministic, pinning "now" to a fixed date.

## Key elements

- **`NOW`** — fixed `Date('2026-10-19T12:00:00.000Z')` used as the clock argument for every test.
- **`daysAgo(days)`** — local helper that returns a `Date` `days` before `NOW` (uses `DAY_MS`).
- **`describe('purchaseHoldUntil')`** — core rule tests: below limit → `undefined`; exactly at limit → oldest counted cancel + window; above limit → second-oldest counted cancel + window (the moment the count drops below the limit); cancels outside the window ignored; cancel exactly one window old treated as aged out; order-independence; empty array → `undefined`.
- **`describe('the 7-day cap on an automatic hold')`** — verifies the hold end is clamped to at most `NOW + 7d` regardless of window length; an end already sooner than the cap is preserved; the boundary is inclusive (an end exactly 7 days out is kept).

## Relationships

- **`src/domain-primitives/time.ts`** — imports `DAY_MS` for all date arithmetic in helpers and expected values.
- **`src/modules/orders/domain/index.ts`** — imports `purchaseHoldUntil` from the domain barrel (the SUT).
- **`src/modules/orders/domain/purchase-hold.ts`** — the module that actually implements `purchaseHoldUntil`; this test file exercises its public contract.

## Notes

- The "above limit" case is the subtliest: with 4 cancels and a limit of 3, the hold lasts until the **second-oldest** cancel ages out (not the oldest), because that is the point at which the in-window count falls back to 2.
- Window boundary is inclusive: a cancel exactly `window` days old is considered aged out.
- The 7-day cap is a hard ceiling on the hold duration from `NOW`; the function must not return a date beyond `NOW + 7d` even when the window is large (e.g., 90 or 14 days).
