---
source: src/modules/delivery/services/preorder-sweep.ts
sha256: 62e30ea6daa360e311d20a7b8013e71e545a9a3d75f89c3e77d0363fba8372ec
generated_at: 2026-10-29T03:41:56.955037+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/preorder-sweep.ts

## Purpose

Implements the daily "preorder sweep" (PRODUCT_STATES P5): finds fulfillment orders that are on hold awaiting stock, whose expected delivery date has passed, and sends the buyer a single informational email saying the date will be missed and no new one is set. The email asks nothing and cancels nothing — the buyer may still cancel, and staff handle the rest on the Late board.

## Key elements

- **`PreorderSweepResult`** — exported interface; the sweep's return shape (`{ notified: number }`).
- **`noticeOne`** (module-private) — Runs a single transaction via `runAct`. Re-reads the fulfillment order inside the session to guard against double-noticing, checks status/hold-reason/`needsDueNotice`, then calls `recordNotice` with reason `'due'`. Returns the `SentNotice` or `undefined`.
- **`runPreorderSweep`** (exported) — Entry point. Accepts an optional `now` (defaults to `new Date()`). Iterates over `fulfillmentOrderRepository.findDatePassed(now)` sequentially, calls `noticeOne` per order, and returns the total count of buyers notified.

## Relationships

- **`../domain` (index) / `../domain/preorder.ts`** — Imports `needsDueNotice`, the domain predicate that decides whether a given date on a fulfillment order still warrants a notice.
- **`../repository`** — Uses `fulfillmentOrderRepository.findDatePassed(now)` to select candidates and `findInSession(id, session)` to re-read inside the transaction.
- **`./act`** — Imports `runAct`, the transactional runner that wraps each per-order mutation in a session and surfaces refusals.
- **`./notice`** — Imports `recordNotice` (persists the notice and produces the `SentNotice` payload) and the `SentNotice` type.
- **`./index`** — Re-exports `runPreorderSweep` as part of the delivery services public API.
- **`../jobs`** — Schedules `runPreorderSweep` as the recurring daily job.
- **`@types`** — Imports `FulfillmentOrderStatus` and `FulfillmentHoldReason` for the eligibility check.
- **`tests/unit/reship.test.ts`** — Exercises the sweep's notice path (and the `runAct` refusal branch) in unit tests.

## Notes

- **Idempotent by design.** Two layers prevent duplicate emails: the domain predicate `needsDueNotice` (a date already marked as noticed is skipped) and the in-transaction re-read in `noticeOne` (catches a concurrent allocation or another sweep run settling the notice between the query and the write).
- **Scope is narrow.** Only `status === on_hold` **and** `holdReason === awaiting_stock` orders are eligible. Orders that are allocated but simply not yet shipped are deliberately excluded; they surface in the admin Late view (ADMIN_SALES A5.3) instead.
- **Sequential, not parallel.** The `for…of` loop processes one order at a time; each is its own independent transaction, so a failure in one does not roll back the others.
- **`now` is injectable.** Tests pass a fixed date rather than relying on the wall clock.
