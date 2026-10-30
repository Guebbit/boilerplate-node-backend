---
source: src/modules/orders/tests/unit/purchase-hold.test.ts
sha256: 50fef47e7f8ca1137dd144c7291d6a1421daea83f0053b348a506b7a5013cb4b
generated_at: 2026-10-29T04:59:52.161006+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/purchase-hold.test.ts

## Purpose

Unit tests for the pure `purchaseHoldUntil` rule: given a buyer's recent cancellation timestamps, a limit, a window, and a reference instant, it returns the date on which the purchase hold expires (or `undefined` if no hold applies). Also pins the `AUTOMATIC_PURCHASE_HOLD_MAX_DAYS` cap.

## Key elements

- **`NOW`** — frozen reference instant (`2026-10-19T12:00:00Z`) used as the "current time" argument in every test call, eliminating real-clock flakiness.
- **`daysAgo(days)`** — local helper returning `NOW − days * DAY_MS`; all test fixtures are expressed relative to `NOW`.
- **`describe('purchaseHoldUntil')`** — covers: below-limit → `undefined`; exactly-at-limit → oldest-counted + window; over-limit → second-oldest + window; outside-window cancels ignored; cancel exactly one window old treated as aged out; order-independence of the input array; empty array → `undefined`.
- **`describe('the 7-day cap on an automatic hold')`** — asserts the constant equals 7; verifies the computed end is clamped to `NOW + 7d` when the window is longer; confirms a naturally-sooner end is preserved; checks the boundary where `oldest + window` equals exactly `NOW + 7d` is kept (inclusive `≤`).

## Relationships

- **`src/domain-primitives/time.ts`** — imports `DAY_MS` for arithmetic on the `daysAgo` helper and expected-value assertions.
- **`src/modules/orders/domain/index.ts`** — re-exports `purchaseHoldUntil` and `AUTOMATIC_PURCHASE_HOLD_MAX_DAYS` from the domain module; this file imports both via the barrel.
- **`src/modules/orders/domain/purchase-hold.ts`** — the module under test; defines the pure `purchaseHoldUntil` function and the `AUTOMATIC_PURCHASE_HOLD_MAX_DAYS` constant.

## Notes

- All test data is derived from the single `NOW` constant; there is no mocking of `Date.now()` or any timer.
- The "aged out" boundary is **inclusive**: a cancel exactly `window` days old is *not* counted (test: `daysAgo(7)` with window 7 → `undefined`).
- The cap is verified as `min(computedEnd, NOW + 7d)`, not as a hard overwrite—the test explicitly checks that a sooner natural end is left unchanged.
