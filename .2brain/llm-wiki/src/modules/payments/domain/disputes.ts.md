---
source: src/modules/payments/domain/disputes.ts
source_sha256: 151acda24876fcb7253fc751206a81e4983e3c27fcc1b3950a01b529488129c3
context_sha256: 3e53d858f0774255fdd7934309dfc2a5325976ff4380c3051c8db53f7861378f
generated_at: 2026-11-22T06:43:45.548406+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/domain/disputes.ts

## Purpose
Pure domain rules for payment disputes (a buyer's bank questioning a card payment). An `inquiry` takes no money; a `chargeback` takes it back immediately and opens an evidence window. The file decides what the shop may still do with a payment while a dispute stands. A chargeback is not a refund: it never raises `payment.refunded` and never issues a credit note.

## Key elements
- `DisputeFacts` – the slice of a stored dispute the rules read (`kind`, `status`, `amount`, `currency`).
- `DisputablePayment` – a payment as seen by these rules (optional `disputes` array).
- `OPEN_DISPUTE_STATUSES` – `needs_response` and `under_review`.
- `openDisputeFilter()` – Mongo filter (`$elemMatch` on `disputes.status` in the open statuses) behind the staff list's `disputed` filter.
- `isOpenDispute(dispute)` – whether a dispute is in an open status.
- `hasOpenDispute(payment)` – any dispute open, of any kind.
- `hasOpenChargeback(payment)` – an open dispute of kind `chargeback`. Refunds are blocked while this holds; an open inquiry does not block them, and a full refund ends it.
- `bankKeptMoney(dispute)` – a chargeback with status `lost` or `accepted`. Inquiries, and `won`/`closed` disputes, give nothing up.
- `keptInOtherCurrency(dispute, currency)` – bank kept money, in a currency different from the payment's.
- `anyDisputeKeptMoney(payment)` – any dispute kept money, in any currency.
- `otherCurrencyKept(payment, currency)` – currency of the first kept dispute that is in another currency, or `undefined`.
- `lostToChargebacks(payment, currency)` – `Money` total (minor units) of kept chargebacks in the payment's currency, via `addMoney` and `toMinorUnits`.

## Relationships
- Imports `addMoney`, `toMinorUnits` and the `Money` type from `src/domain-primitives/money.ts`, and `DisputeKind` and `DisputeStatus` from `src/types/index.ts`.
- Sits in the payments domain alongside `src/modules/payments/domain/dispute-end.ts` and `src/modules/payments/domain/lifecycle.ts`.
- The service files in the neighbor list (`src/modules/payments/services/disputes.ts`, `src/modules/payments/services/list.ts`, `src/modules/payments/services/refund-settlement.ts`, `src/modules/payments/services/refunds.ts`, `src/modules/payments/services/view.ts`) and `src/modules/payments/repository.ts` are graph neighbors of this file. The visible code does not show how each uses it, but the doc comments point to the staff list filter and refund limits as the intended consumers.
- Covered by neighbor tests such as `src/modules/payments/tests/unit/dispute-end.test.ts` and `src/modules/payments/tests/unit/refund-rules.test.ts`.

## Notes
- Disputes in a different currency than the payment are never subtracted in `lostToChargebacks`. Staff must check them in the provider's dashboard, which is what `keptInOtherCurrency` and `otherCurrencyKept` flag.
- A `won` chargeback takes nothing, so a late win restores refund room automatically.
- All functions treat a missing `disputes` field as an empty list.
- `openDisputeFilter` operates on stored fields and reuses `OPEN_DISPUTE_STATUSES`, so the two stay consistent.
