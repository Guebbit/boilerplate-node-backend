---
source: src/modules/returns/services/receive.ts
sha256: 1438c614e3bb5097658d4712ceec12854889e852580d25a751d6b8576b928523
generated_at: 2026-11-08T08:06:06.168031+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/receive.ts

## Purpose

Implements the "goods arriving" step of a return: transitions the status `approved → received`, restocks the requested units into inventory, and (for a refund remedy) opens the refund record — all in a single transaction. It is the single entry point a staff member calls when a returned parcel physically arrives at the warehouse.

## Key elements

- **`ReceiveReturnInput`** – Staff-facing input: optional `handlingDeduction` (decimal, kept back under Art. 14(2)), optional `lines` (per-product restock counts; absent means full restock), optional `remedy` (`refund` | `replace` | `repair`; absent means refund).
- **`claimAndRestock`** – The core transactional operation. Under the order's lock row it: (1) reads all other returns to compute the refund quote, (2) conditionally claims `approved → received` (idempotent under concurrent clicks), (3) restocks sellable units via inventory, (4) hands over the remedy, (5) opens the refund record, and (6) publishes `RETURN_RECEIVED`. Returns a `Claimed` discriminated union.
- **`Claimed`** – Union of outcomes: `deduction-too-high`, `refused` (422/409 reject), `lost` (concurrent claim lost), or `received` with the document, breakdown, and optionally the opened refund.
- **`quote`** – Computes the `RefundBreakdown` (goods, shipping, deduction, total) for a refund remedy, accounting for every other return/cancel already settled on the same order. Shipping is included only if this return is the last unit and shipping is still owed.
- **`handOverRemedy`** – For `replace`: calls `deliveryService.reopenForReplacement` to re-ship the units. For `repair`: calls `orderService.extendGuarantee` (+12 months). For `refund`: no-op (money is handled by the refund record + sweep).
- **`restockedLines` / `stampRestocked`** – Helpers that map per-line restock counts into inventory calls and into the `lines.<i>.restocked` projection stamps.
- **Error builders** – `notReceivable` (409), `badRestock` (422), `badRemedyFor` (422), `deductionOnGuarantee` (422). Each returns a `ResponseReject` with a field-scoped error.
- **`NO_REFUND`** – Zero-valued `RefundBreakdown` used when the remedy is replace/repair (no money moves).

## Relationships

- **`@domain-primitives/money`** – `NO_MONEY` and `toMinorUnits` are used to zero-check the handling deduction before persisting it.
- **`@infrastructure/http/response`** – `fieldError`, `generateReject`, `generateSuccess` shape every API response this file returns.
- **`@infrastructure/i18n`** – `t()` localises all user-facing error and field messages.
- **`@infrastructure/observability/audit`** – `recordAudit` logs the receipt action for compliance.
- **`@kernel/outbox`** – `announceInTransaction` wraps the entire mutation + `RETURN_RECEIVED` event in one atomic unit, deferring delivery until commit.
- **`@modules/access`** – `ownOrderFlag` is applied to enforce that the caller is authorised on the order.
- **`@modules/delivery`** – `deliveryService.reopenForReplacement` re-opens units for re-shipping on a replace remedy; `ActRefusal` signals an abort when re-shipping is impossible; `cheapestStandardShipping` feeds the refund quote to cap the shipping refund.
- **`@modules/inventory`** – `inventoryService.restockReturnedLines` writes the stock movement inside the same transaction, including paid-backorder top-ups.

## Notes

- **Two clocks, deliberately kept apart.** "Received" (parcel + restock) and "closed" (money) are separate facts. The refund *provider* call is made only after commit via the payment sweep; the return stays `received` until `PAYMENT_REFUNDED` lands, at which point the listener closes it. This prevents a return from being stuck in a state nobody is retrying.
- **Idempotency by design.** The status claim is conditional on `approved` (via `RECEIVABLE_RETURN_STATUSES`), so repeated staff clicks or racing transactions can only succeed once.
- **Deduction is forbidden on guarantee remedies.** If `reason` qualifies as a guarantee return (`isGuaranteeReason`), a non-zero `handlingDeduction` is rejected with 422 — replace/repair are free of charge under Directive 2019/771.
- **`restocked` defaults to full.** If `lines` is absent in the input, every returned line is restocked at its full quantity. A line explicitly set to `0` writes no inventory movement at all.
- **`cheapestStandardShipping` is computed from the order's line-item total**, not from the return's lines, to ensure the shipping refund cap is consistent regardless of which return triggers it.
