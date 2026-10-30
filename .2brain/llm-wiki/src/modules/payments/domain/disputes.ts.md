---
source: src/modules/payments/domain/disputes.ts
sha256: fc61846dd346a0ea39e3be53a3512907220343126459755d947670f1133dcd9f
generated_at: 2026-10-29T05:04:50.086240+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/domain/disputes.ts

## Purpose

Pure domain rules for card-payment disputes. It encodes the distinction between an *inquiry* (no money moves) and a *chargeback* (bank reclaims funds, opens an evidence window), and answers the question "what may the shop still do with this payment while a dispute stands?" — specifically around refund blocking and partial-loss accounting. No I/O, no side effects.

## Key elements

- **`DisputeFacts`** — read-only slice (`kind`, `status`, `amount`, `currency`) of a stored dispute that the rules consume.
- **`DisputablePayment`** — minimal payment shape (`disputes?: readonly DisputeFacts[]`) accepted by every rule function.
- **`OPEN_DISPUTE_STATUSES`** (exported const) — `needs_response` and `under_review`; the statuses where action is still pending.
- **`LOSS_DISPUTE_STATUSES`** (module-private Set) — `lost` and `accepted`; the bank keeps the money.
- **`openDisputeFilter()`** — returns a raw Mongo `$elemMatch` filter for the staff list's `disputed` column.
- **`isOpenDispute(dispute)`** — true if a single dispute is in an open status.
- **`hasOpenDispute(payment)`** — true if *any* dispute (inquiry or chargeback) is still open.
- **`hasOpenChargeback(payment)`** — true only for an open *chargeback*; this is the gate that blocks refunds.
- **`lostToChargebacks(payment, currency)`** — sums amounts of chargebacks in a loss status; returns `Money` in minor units. A `won` chargeback contributes zero.
- **`lostChargebackCovers(payment, amount, currency)`** — true if the lost chargeback total ≥ the given refund amount (used to report a refunded-as-returned state).
- **`hasDecidedDispute(payment)`** — true when disputes exist but none is an open chargeback (i.e. the `disputed` refusal reason no longer applies).

## Relationships

- **Imports** `addMoney`, `toMinorUnits`, `Money` from `@domain-primitives/money` for all arithmetic and unit conversion.
- **Imports** `DisputeKind`, `DisputeStatus` from `@types` as the enum vocabulary.
- **Re-exported** through `src/modules/payments/domain/index.ts`, making it the canonical import point for consumers.
- **Consumed by** the service layer: `services/disputes.ts`, `services/refunds.ts`, `services/refund-settlement.ts`, `services/list.ts`, and `services/view.ts` call these predicates to gate business flows.
- **Tested by** `tests/unit/refund-rules.test.ts`, which exercises the refund-blocking and loss-coverage logic.

## Notes

- A chargeback is **not** a refund: it lowers `charged`, never raises `payment.refunded`, and never issues a credit note. Conflating the two is the primary gotcha for anyone extending this module.
- An open **inquiry** does *not* block refunds; only an open **chargeback** does. `hasOpenDispute` is broader than `hasOpenChargeback` — use the right one for the gate.
- `lostToChargebacks` returns a `Money` object (minor units), not a raw number. Compare against `toMinorUnits(...)` when checking coverage.
- `openDisputeFilter` returns a plain `Record<string, unknown>` shaped for a Mongo query; it is not a Mongoose `Query` and should be spread into a repository call rather than passed as a filter object to a Mongoose model.
