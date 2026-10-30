---
source: src/modules/orders/domain/purchase-hold.ts
sha256: a23fec60819190754c884b18d5d9c67eef4a7c7b4943740547f0e1244fc55d7d
generated_at: 2026-10-29T04:40:10.563627+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/purchase-hold.ts

## Purpose

Pure domain logic that determines whether a buyer's own cancellations trigger an automatic purchase hold and, if so, computes the instant the hold expires. All temporal inputs are passed as arguments so the logic is testable without a clock or database.

## Key elements

- **`AUTOMATIC_PURCHASE_HOLD_MAX_DAYS`** (exported const, value `7`) — Upper bound (in days) on how long an automatic hold may last. Rationale: GDPR Art. 22 favors short-lived machine-only decisions; also ensures a raised window can never stretch the pause beyond one week. Manual holds are not subject to this cap.
- **`purchaseHoldUntil(cancelTimes, limit, windowDays, now)`** (exported function) — Returns a `Date` marking the end of the hold, or `undefined` if the cancellations within the window do not reach the limit.
  - Filters `cancelTimes` to those within `windowDays` of `now`, sorts ascending.
  - If fewer than `limit` qualify, no hold applies.
  - Otherwise the end is the moment the `(count − limit + 1)`-th-oldest cancellation ages out, capped at `AUTOMATIC_PURCHASE_HOLD_MAX_DAYS` from `now`.

## Relationships

- **`src/domain-primitives/time.ts`** — Supplies the `DAY_MS` constant used for all millisecond arithmetic.
- **`src/modules/orders/domain/index.ts`** — Barrel file that re-exports this module so callers can import from the domain entry point.
- **`src/modules/orders/services/purchase-hold.ts`** — Service-layer caller that assembles the `cancelTimes` query and invokes `purchaseHoldUntil` to persist or lift a hold.
- **`src/modules/orders/tests/unit/purchase-hold.test.ts`** — Unit suite that exercises `purchaseHoldUntil` with fixed `now` values (no real clock needed thanks to the pure signature).

## Notes

- The function is intentionally order-agnostic for `cancelTimes`; it sorts internally. Callers do not need to pre-sort.
- `limit` is assumed ≥ 1; the code relies on `counted.length >= limit` to guarantee the index `counted[counted.length - limit]` is valid (the comment documents this invariant).
- `windowDays` and `limit` are caller-supplied per call (e.g., from a config or policy object); the only hardcoded policy value is the 7-day cap.
- The hold end is computed as an *absolute* instant relative to `now`, not as a duration—consumers should store the returned `Date` rather than re-derive it.
