---
source: src/modules/orders/domain/withdrawal.ts
sha256: 913abb138d178c741221bfa99151ec099c50654e633d51989153ca394c27b20e
generated_at: 2026-10-15T11:03:35.241749+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/withdrawal.ts

## Purpose

Pure decision logic for the EU right of withdrawal (Consumer Rights Directive Art. 9, 11a, 16) as applied to a single order. It answers three questions—whether a withdrawal is a cancel or a return, when the 14/21/30-day window closes, and whether the withdrawal button should render—without touching a database or any side effect.

## Key elements

- **`isBeforeDispatch(order: DispatchCandidate): boolean`** — Returns `true` when the order is in a pre-dispatch status *and* nothing has shipped (`fulfillment.shipped !== true`). Used to decide whether a withdrawal is a cancel (nothing left) vs. a return (goods in transit or delivered).
- **`withdrawUntilFrom(start: Date, days: number): Date`** — Computes the last instant the window is open using **calendar-day** semantics (Regulation 1182/71 Art. 3): the event day is not counted; the period ends at 23:59:59.999 of the `days`-th day. Days are UTC.
- **`withdrawalStartFor(order: WithdrawalClockCandidate, at: Date): Date`** — Returns the clock-start instant: `paidAt` for digital-only orders (contract conclusion, Art. 9(2)(c)), otherwise `at` (delivery, Art. 9(2)(b)).
- **`isExcludedFromWithdrawal(line: WithdrawableLine): boolean`** — True when `line.product?.noWithdrawal === true` (Art. 16(c)–(d) goods: made-to-order, personalised, perishable).
- **`canWithdraw(order: WithdrawalCandidate, now: Date): boolean`** — Combines status traits (`withdrawable`), per-line exclusion, and window expiry into a single "show the button?" check.

Supporting types: `DispatchCandidate`, `WithdrawalClockCandidate`, `WithdrawableLine`, `WithdrawalCandidate` — minimal read-only shapes so callers need not pass a full order entity.

## Relationships

- **`./rules`** — Imports `isDigitalOnlyOrder` and `ShippableLineCandidate`; used inside `withdrawalStartFor` to detect digital-only orders.
- **`./status-traits`** — Imports `ORDER_STATUS_TRAITS`; consulted by both `isBeforeDispatch` (`.beforeDispatch`) and `canWithdraw` (`.withdrawable`).
- **`./fulfillment`** — Imports the `FulfillmentSummary` type (used via `Pick<…, 'shipped'>` in `DispatchCandidate`).
- **`./index.ts`** — Barrel file that re-exports this module for consumers.
- **`src/modules/orders/services/status.ts`, `services/override.ts`, `services/scope.ts`** — Downstream services that call `canWithdraw` / `isBeforeDispatch` to gate UI or state transitions.
- **`src/modules/returns/services/cancel-remainder.ts`, `services/create.ts`, `services/options.ts`** — Return-flow services that use `isBeforeDispatch` to choose cancel vs. return paths.
- **`src/modules/orders/tests/unit/withdrawal.test.ts`** — Unit tests covering all exported functions.

## Notes

- **Calendar-day math, not `days × 24 h`.** `withdrawUntilFrom` floors to UTC midnight of the event day, adds `(days + 1)` days, then subtracts 1 ms. Do not replace with a simple `start + days * DAY_MS` offset.
- **`isBeforeDispatch` reads `fulfillment.shipped`, not the order status.** An order can be `processing` yet partially shipped; keying on status alone would misclassify a mixed order as a cancel.
- **`withdrawUntil` is `undefined` until the clock starts.** `canWithdraw` treats `undefined` as "no deadline yet" (window is open). Callers must not confuse this with a zero-date.
- **Weekend / public-holiday rollover (Reg. 1182/71 Art. 3(4)) is deliberately omitted.** The configured minimum period (`orders/config.ts`) always exceeds 14 days, so the roll-over can never be the binding constraint.
- **`isExcludedFromWithdrawal` uses strict `=== true`.** A `null` or `undefined` flag means the line is *not* excluded; only an explicit `true` excludes it.
- The module is intentionally side-effect-free and stateless; all temporal data arrives as parameters. No I/O, no config reads.
