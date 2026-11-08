---
source: src/modules/delivery/services/preorder-sweep.ts
sha256: 62e30ea6daa360e311d20a7b8013e71e545a9a3d75f89c3e77d0363fba8372ec
generated_at: 2026-11-08T05:37:46.717411+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/preorder-sweep.ts

## Purpose

Implements the daily sweep over waiting preorders: finds fulfillment orders whose expected date is imminent or passed while still on hold awaiting stock, and sends a single informational notice to the buyer that the date will be missed. It never cancels, reschedules, or prompts the buyer—silence leaves the order in the buyer's hands and lets staff handle the late order on the board.

## Key elements

- **`runPreorderSweep(now?: Date)`** — Exported entry point. Iterates over `fulfillmentOrderRepository.findDatePassed(now)`, calls `noticeOne` sequentially for each order, and returns `{ notified }`. Accepts an injected `now` for test determinism.
- **`noticeOne(fulfillmentOrderId, now)`** *(private)* — Re-reads the order inside a `runAct` transaction, re-validates status (`on_hold`), hold reason (`awaiting_stock`), and `needsDueNotice`, then calls `recordNotice`. Returns `undefined` (no mail) if any check fails or the act is refused.
- **`PreorderSweepResult`** — Interface: `{ notified: number }`.

## Relationships

- **`../repository`** (`fulfillmentOrderRepository`) — Provides `findDatePassed(now)` to enumerate candidate orders and `findInSession(id, session)` to re-read an order inside the transaction.
- **`./act`** (`runAct`) — Wraps the per-order check-and-record in a single database transaction; the buyer's mail is emitted as a commit event.
- **`./notice`** (`recordNotice`, `SentNotice`) — Persists the notice record and produces the mail payload within the same session.
- **`../domain`** (`needsDueNotice`) — Domain predicate that decides whether a given date has already been noticed or is still eligible.
- **`@types`** — `FulfillmentOrderStatus` and `FulfillmentHoldReason` enums used for the status/hold-reason guard.
- **`../jobs`** — The job scheduler that invokes `runPreorderSweep` on its daily cadence.
- **`./index`** — Re-exports the sweep for consumers outside the services folder.
- **`../tests/unit/reship.test.ts`** — Unit tests that exercise sweep logic with injected dates.

## Notes

- **Idempotency:** `needsDueNotice` prevents a second notice for a date already recorded, so repeated runs (or overlapping schedules) are safe.
- **Re-read as race guard:** The order is fetched again *inside* the transaction (`findInSession`) so a concurrent allocation or prior sweep run that already settled the notice is detected before writing.
- **Scope boundary:** Only `on_hold` + `awaiting_stock` orders are eligible. Allocated-but-unshipped orders are intentionally excluded—they surface in the admin Late view instead.
- **Sequential, not parallel:** The for-loop processes one order at a time; each notice rides its own transaction commit.
