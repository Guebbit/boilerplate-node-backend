---
source: src/modules/orders/domain/withdrawal.ts
sha256: 259f5796e8e98b12cf8e9b8e9ba91acc03e4ecbdc25ffb62dfc76c8036e50a7e
generated_at: 2026-11-14T20:36:31.365672+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/withdrawal.ts

## Purpose

Pure domain logic for the EU right of withdrawal (Consumer Rights Directive 2011/83/EU) and the statutory guarantee of conformity as they apply to a single order. It answers, without any I/O: when the withdrawal window opens and closes, whether a withdrawal is a cancel or a return, whether staff can still redirect unshipped units, when the shop must refund, and when the conformity guarantee expires. Every service, email, timeline row, and UI button reads from these functions so the answer is computed in exactly one place.

## Key elements

- **`isBeforeDispatch(order)`** – Returns `true` when nothing has shipped (status trait + `fulfillment.shipped !== true`), i.e. a withdrawal is a *cancel* rather than a *return*.
- **`canCorrectAddress(order)`** – Returns `true` when at least one unshipped unit still exists and the order has a shipping address, so staff may redirect the remaining units.
- **`withdrawUntilFrom(start, days)`** – Computes the announced last valid day (end of the Nth UTC day after `start`), following Reg. 1182/71 calendar-day rules.
- **`withdrawalClosesAt(withdrawUntil)`** – The real enforcement instant: one UTC day after the announced last day, absorbing timezone edge cases.
- **`withdrawalRefundDueBy(informedAt, timeZone)`** – The last instant the shop may refund without being late (14 calendar days in the shop's IANA zone).
- **`conformityUntilFrom(deliveredAt)`** – End of the 2-year statutory guarantee plus a 7-day margin for UTC offset and weekend roll-over.
- **`repairedConformityUntil(current)`** – Extends the guarantee by 12 months post-repair (Dir. 2024/1799).
- **`withdrawalStartFor(order, at)`** – Single owner of the clock-start rule: payment date for digital-only orders, delivery date for goods.
- **`deliveryClockFor(order, at, days)`** – Convenience pair: `{ withdrawUntil, conformityUntil }` frozen at delivery.
- **`isExcludedFromWithdrawal(line)`** – Checks the per-line `product.noWithdrawal` flag (Art. 16 excluded goods).
- **`withdrawalRefusalOf(order, now)`** – The one source of truth for *why* withdrawal is blocked (`all_excluded`, `window_closed`, `nothing_left`) or `undefined` when open.
- **Constants** – `WITHDRAWAL_SEND_BACK_DAYS` (14), `WITHDRAWAL_REFUND_DAYS` (14), `CONFORMITY_YEARS` (2), `CONFORMITY_MARGIN_DAYS` (7), `REPAIR_EXTENSION_MONTHS` (12).
- **Interfaces** – `DispatchCandidate`, `AddressCandidate`, `WithdrawalClockCandidate`, `WithdrawalCandidate`, `WithdrawableLine`, `DeliveryClock`: minimal structural types each function reads, decoupling callers from full order models.

## Relationships

- **`src/domain-primitives/time.ts`** – Source of `DAY_MS`, `dayInZone`, `endOfUtcDay`, `startOfDayInZone`; all calendar-day arithmetic in this file delegates to these helpers.
- **`src/modules/orders/domain/status-traits.ts`** – Provides `ORDER_STATUS_TRAITS`; every eligibility check (`beforeDispatch`, `withdrawable`) reads a boolean from the status's trait record.
- **`src/modules/orders/domain/rules.ts`** – Provides `isDigitalOnlyOrder` and `ShippableLineCandidate`; used by `withdrawalStartFor` to decide whether the clock starts at payment or delivery.
- **`src/modules/orders/domain/fulfillment.ts`** – Provides the `FulfillmentSummary` type; `DispatchCandidate` and `AddressCandidate` pick a subset of its fields.
- **`src/modules/orders/domain/index.ts`** – Barrel re-export; this file's public API is the module's external surface.
- **`src/modules/orders/services/actions.ts`** – Consumes `withdrawalRefusalOf`, `isBeforeDispatch`, `canCorrectAddress` to gate the UI button and the `POST /returns` endpoint.
- **`src/modules/orders/services/status.ts`** – Calls `deliveryClockFor` / `withdrawalStartFor` when an order transitions to `delivered` to freeze the deadlines.
- **`src/modules/orders/services/guarantee.ts`** – Calls `conformityUntilFrom` and `repairedConformityUntil` to manage the conformity deadline.
- **`src/modules/orders/services/override.ts`** – Reads `canCorrectAddress` before allowing a delivery-address override on unshipped units.
- **`src/modules/orders/services/address.ts`** – Reads `canCorrectAddress` to gate address corrections on the remaining (unshipped) portion of an order.
- **`src/modules/orders/emails.ts`** – Reads the frozen `withdrawUntil` / `withdrawalClosesAt` values to compose deadline-notice mails.
- **`src/modules/orders/repository.ts`** – Persists and fetches the frozen `DeliveryClock` fields on the order row.
- **`src/modules/orders/tests/integration/timeline.test.ts`** – Verifies that timeline rows render the same dates these functions produce.
- **`src/modules/delivery/tests/integration/override-sync.test.ts`** – Exercises `canCorrectAddress` through the delivery override flow.
- **`src/modules/delivery/tests/integration/service.test.ts`** – Exercises `isBeforeDispatch` through the shipped-status stamp.

## Notes

- **Two deadlines, one concept.** `withdrawUntil` is the date shown to the buyer; `withdrawalClosesAt` is the actual enforcement instant (one UTC day later). Never compare `now` against `withdrawUntil` directly—always use `withdrawalClosesAt`.
- **Calendar-day rules are intentional, not incidental.** Reg. 1182/71 means the event day does not count and the period ends at 23:59:59.999 of the last day, not `event + N×24h`. Do not "simplify" to `Date + N*DAY_MS` without also calling `endOfUtcDay`.
- **No weekend/holiday roll-over is computed.** The configured minimum period always exceeds the longest possible Art. 3(4) shift, so the margin is baked into the constant values rather than the logic.
- **`Date.UTC` for rollover.** In `withdrawalRefundDueBy` and `conformityUntilFrom`, month/year overflow is delegated to `Date.UTC`'s normalisation rather than manual carry logic.
- **The file is the single owner of the clock-start rule.** Any code path that transitions an order to `delivered` must call `withdrawalStartFor` (or `deliveryClockFor`); computing the start date ad hoc in a service will drift from the law.
- **`withdrawalRefusalOf` returns `undefined` for non-withdrawable statuses** (e.g. `canceled`)—callers must treat that as "no reason, no button," not as "withdrawal available."
