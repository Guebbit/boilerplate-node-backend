---
source: src/modules/orders/domain/withdrawal.ts
sha256: b26069589b1af7927a4a31c8ca3bd38d21b6eb527d773cd8248be576e3e63e85
generated_at: 2026-11-08T06:51:18.782084+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/withdrawal.ts

## Purpose

Pure domain logic for the consumer's right of withdrawal and the legal guarantee of conformity, per the Consumer Rights Directive (Art. 9, 11a, 16) and Directives 2019/771 & 2019/770. Answers three questions for an order in isolation: *when does the withdrawal window close*, *may the withdrawal button show*, and *when does the two-year conformity guarantee end*. All date math is UTC calendar-day based (Regulation 1182/71); no I/O, no side effects.

## Key elements

- **`isBeforeDispatch(order: DispatchCandidate)`** — `true` when a withdrawal would be a *cancel* (nothing shipped) rather than a *return*. Reads `fulfillment.shipped`, not the order status, so a partially-shipped order in `processing` still counts as "dispatched."
- **`canCorrectAddress(order: AddressCandidate)`** — `true` when staff may redirect remaining units to a new address. Requires an address, `beforeDispatch` status, and (if partially shipped) `remaining > 0`.
- **`withdrawUntilFrom(start, days)`** — The *announced* last day of the withdrawal period, using calendar-day counting (event day excluded; period ends at end-of-UTC-day).
- **`withdrawalClosesAt(withdrawUntil)`** — The *real* close: one silent UTC day after the announced date, so a buyer off by a timezone or a delivery stamped after midnight is never rejected.
- **`conformityUntilFrom(deliveredAt)`** — End of the two-year legal guarantee (2 years + 7-day margin for UTC offset and weekend roll-over).
- **`repairedConformityUntil(current)`** — Extends the guarantee by 12 months (Directive 2024/1799 / Art. 13).
- **`withdrawalStartFor(order, at)`** — Clock start: `paidAt` for digital-only orders (Art. 9(2)(c)), `at` (delivery) for goods. Single owner of this rule.
- **`deliveryClockFor(order, at, days)`** → `DeliveryClock` — Computes both `withdrawUntil` and `conformityUntil` in one call at delivery time.
- **`isExcludedFromWithdrawal(line)`** — Checks `product.noWithdrawal` (Art. 16(c)–(d): made-to-order, personalised, perishable).
- **`withdrawalRefusalOf(order, now)`** — First refusal reason (`all_excluded`, `window_closed`, `nothing_left`) or `undefined` if open. Single source of truth shared by the UI button and the API endpoint.
- **`canWithdraw(order, now)`** — Convenience: status is withdrawable **and** `withdrawalRefusalOf` returns `undefined`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `domain-primitives/time.ts` | Provides `DAY_MS` and `endOfUtcDay` used by all date math in this file. |
| `domain/fulfillment.ts` | `FulfillmentSummary` type is picked (`shipped`, `remaining`) into the candidate interfaces. |
| `domain/rules.ts` | `isDigitalOnlyOrder` and `ShippableLineCandidate` drive the clock-start and exclusion logic. |
| `domain/status-traits.ts` | `ORDER_STATUS_TRAITS` supplies `beforeDispatch` and `withdrawable` per status. |
| `domain/index.ts` | Barrel re-export; consumers import from the index rather than this path directly. |
| `services/actions.ts`, `services/status.ts`, `services/address.ts`, `services/guarantee.ts`, `services/override.ts` | Call sites for `canWithdraw`, `withdrawalRefusalOf`, `canCorrectAddress`, `deliveryClockFor`, and the guarantee helpers. |
| `emails.ts` | Reads the frozen `withdrawUntil` / `conformityUntil` dates to render deadlines in customer mail. |
| `repository.ts` | Persists the `DeliveryClock` values frozen at delivery. |
| Integration tests (`timeline.test.ts`, `override-sync.test.ts`, `service.test.ts`) | Exercise the pure functions and their service-level call sites. |

## Notes

- **Two deadlines, one grace day.** `withdrawUntil` is the date *told* to the buyer; `withdrawalClosesAt` is the actual reject threshold (announced date + 1 UTC day). Never compare `now` directly against `withdrawUntil`.
- **UTC calendar days, not 24 h blocks.** `withdrawUntilFrom` uses `endOfUtcDay`, so a 14-day period from 03:00 UTC on the 1st closes at 23:59:59 UTC on the 14th, not at 03:00 on the 15th.
- **Digital vs. goods clock.** `withdrawalStartFor` branches on `isDigitalOnlyOrder`; for digital content the clock starts at `paidAt` (contract conclusion), not delivery. If `paidAt` is missing it falls back to the delivery instant.
- **Partial shipment.** `canCorrectAddress` deliberately allows correcting the *remaining* units even when some have already shipped (`shipped === true` but `remaining > 0`). A parcel in transit keeps its original address.
- **Guarantee is a floor.** The 7-day margin and the 12-month repair extension only push the end date *later*; no code path shortens the guarantee (Art. 21 non-waivability).
- **Pure & side-effect-free.** Every export is a function or interface; the module never writes, fetches, or reads config. The period length (`days`) is injected by the caller from `orders/config.ts`.
