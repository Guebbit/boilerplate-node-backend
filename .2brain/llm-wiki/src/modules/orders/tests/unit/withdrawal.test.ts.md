---
source: src/modules/orders/tests/unit/withdrawal.test.ts
sha256: b6dfd424deac0ba418eddb57175877eaf7201566f80af5b060232a40f8426b36
generated_at: 2026-10-15T11:22:16.739398+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/withdrawal.test.ts

## Purpose

Unit tests for the pure withdrawal-window rules (Consumer Rights Directive Art. 9/11a/16) that live in the orders domain layer. Verifies the start/end calculation of the 14-day window, status-based eligibility, dispatch state, and per-line exclusion logic.

## Key elements

- **`withdrawalStartFor` tests** — Physical orders start at arrival (`NOW`); digital-only orders start at `paidAt`; unpaid digital falls back to arrival.
- **`withdrawUntilFrom` tests** — Confirms the window excludes the event day (14 full days *after*), always resolves to `23:59:59.999Z` of the 15th calendar day, is independent of the event's time-of-day, and handles month boundaries correctly.
- **`canWithdraw` tests** — True for all statuses before the window opens; always false for `cancelled`; true on the exact last instant; false one millisecond after expiry; false when every line is excluded; true if at least one line is eligible.
- **`isBeforeDispatch` tests** — `pending`/`paid`/`processing` read as in-shop; `shipped`/`delivered`/`cancelled` read as past dispatch; a `processing` order with `fulfillment.shipped: true` is treated as past dispatch (shipment fact overrides status).
- **`isExcludedFromWithdrawal` tests** — True only when `product.noWithdrawal === true`; false for `false`, missing key, or `product: null`.

## Relationships

- **Imports** `canWithdraw`, `isBeforeDispatch`, `isExcludedFromWithdrawal`, `withdrawalStartFor`, `withdrawUntilFrom` from `src/modules/orders/domain/index.ts` (barrel that re-exports from `src/modules/orders/domain/withdrawal.ts`).
- **Imports** `OrderStatus` enum from `src/types/index.ts` for status-based test cases.

## Notes

- The 14-day window is calendar-day based: the event day is day 0, so the deadline is the 15th calendar day at `23:59:59.999Z`. Tests assert this explicitly with ISO strings.
- `isBeforeDispatch` is not purely status-driven; the `fulfillment.shipped` boolean can flip the result for a `processing` order (partial shipment case).
- Exclusion is per-line, not per-order: a mixed order (one excluded line, one eligible) still gets withdrawal offered.
- A fixed `NOW` constant (`2026-03-10T12:00:00Z`) is shared across all `describe` blocks to keep boundary tests deterministic.
