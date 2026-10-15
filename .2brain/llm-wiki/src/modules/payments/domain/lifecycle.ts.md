---
source: src/modules/payments/domain/lifecycle.ts
sha256: caf6cb4e7039a4e965721ee77a9190cc6687bce07ca9ac416fd8bc821222cc98
generated_at: 2026-10-15T11:25:20.326648+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/domain/lifecycle.ts

## Purpose

Defines the set of payment statuses from which each write operation is permitted to run. Unlike an explicit `from → to` transition graph, these arrays encode only the "may I still move this payment?" guard, because every transition funnels through the single `settlePayment` function. Each array doubles as the `$in` predicate in the conditional write, so membership in the set **is** the concurrency guard, not an annotation.

## Key elements

- **`CONFIRMABLE_PAYMENT_STATUSES`** — `['requires_confirmation', 'declined']`. Gate for `confirmPayment`. In-flight statuses (`requires_action`, `processing`) are intentionally excluded; those are resolved by re-reading, not by re-confirming.
- **`SETTLEABLE_PAYMENT_STATUSES`** — all four non-terminal statuses. Gate for confirm, sync, and webhook settlement writes. Excluding `succeeded` and `cancelled` is what makes `settlePayment` at-most-once.
- **`SUCCESS_SETTLEABLE_PAYMENT_STATUSES`** — settleable plus `cancelled`. Used only by the success write, the amount-mismatch write, and the provider re-read gate, because money arriving on a cancelled intent is still real and must be recorded.
- **`REAPABLE_PAYMENT_STATUSES`** — settleable plus `cancelled`. Allow-list for the retention reaper; a newly added money status will never be swept by default.
- **`REFUNDABLE_PAYMENT_STATUS`** — single value `'succeeded'`. The only status from which a refund may originate.
- **`OPEN_REFUND_STATUSES`** — `[pending, failed]`. Refund states still open for retry or settlement; `succeeded` is absent to preserve at-most-once refund landing.

## Relationships

- **`src/types/index.ts`** — Imports `PaymentStatus` and `RefundStatus` enums used to type every exported array.
- **`src/modules/payments/repository.ts`** — Consumes these arrays as the `$in` argument to conditional writes (`updateStatusIfIn`, `upsertConfirmable`), re-asserting the guard under the document lock.
- **`src/modules/payments/services/settlement.ts`** — `settlePayment` is the sole consumer of `SETTLEABLE_PAYMENT_STATUSES` / `SUCCESS_SETTLEABLE_PAYMENT_STATUSES`; all status transitions pass through this one function.
- **`src/modules/payments/services/intent.ts`** — `confirmPayment` uses `CONFIRMABLE_PAYMENT_STATUSES` as its entry gate.
- **`src/modules/payments/domain/index.ts`** — Barrel re-export; these constants are part of the domain's public API.

## Notes

- Arrays are used instead of `Set` because they are read both as a membership test *and* spread into a Mongo `$in` clause. A `Set` would require re-spreading for the second use.
- `REAPABLE_PAYMENT_STATUSES` is deliberately an **allow-list**, not a deny-list, so a future money-bearing status is safe by default.
- `SUCCESS_SETTLEABLE_PAYMENT_STATUSES` and `REAPABLE_PAYMENT_STATUSES` happen to contain the same four values today, but they are semantically distinct: one gates "money can land here," the other gates "this is safe to delete." Do not merge them.
- The file contains no runtime logic—only constant declarations—so it is safe to import anywhere without side effects.
