---
source: src/modules/returns/services/receive.ts
sha256: fdd30de1cc069fe1302e699173f032120a725dd6175880b275cdd3fc91433e23
generated_at: 2026-11-14T21:41:02.049873+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/receive.ts

## Purpose

Handles the "goods arriving" step of a return: transitions the status `approved → received`, restocks the units the staff put back on sale, and records the buyer's remedy (refund, replace, or repair) — all inside a single conditional transaction. It intentionally keeps two facts on separate clocks: the parcel receipt (one atomic move + restock) and the money movement (refund record opened in-transaction, provider call deferred to after commit and retried by a payment sweep).

## Key elements

- **`ReceiveReturnInput`** — staff-facing input: optional `handlingDeduction` (decimal string), optional `lines` (per-unit restock counts, `0` = broken/kept back), optional `remedy` (defaults to refund).
- **`notReceivable()`** — 409 reject for a return not in `approved` state.
- **`badRestock(verdict)`** — 422 reject pointing at the offending `lines.<i>.restock` entry.
- **`NO_REFUND`** — zero-value `RefundBreakdown` constant for replace/repair outcomes.
- **`Claimed`** — discriminated-union type for the transaction outcome: `deduction-too-high`, `refused` (carries a `ResponseReject`), `lost` (race lost), or `received` (carries the stamped document, breakdown, opened refund record, and whether the proof of sending pre-opened it).
- **`stampRestocked(restocked)`** — builds the dotted-path write object (`lines.0.restocked`, …) persisted on the return document.
- **`restockedLines(lines, restocked)`** — maps return lines to `{productId, quantity}` pairs, excluding zero-quantity entries.
- **`quote(returned, order, earlier, handlingDeduction)`** — computes the refund breakdown (goods, shipping, deduction, total) from the return's frozen lines, the order's shipping cost, earlier returns/cancels on the order, and whether this return takes the last unit (triggering the delivery claim). Exported for external callers.
- **`handOverRemedy(received, remedy, context, session)`** — for `replace`, calls the delivery module to re-open units on the order for re-shipment; for `repair`, calls `orderService.extendGuarantee` (+12 months); for `refund`, a no-op. Throws `ActRefusal` if re-shipment is impossible.
- **`claimAndRestock(…)`** — the core transactional unit (wrapped in `announceInTransaction`): locks the order row, reads all sibling returns, checks `proofOpenedRefund`, quotes or skips the refund, conditionally claims the status (`approved` → `received`), restocks via the inventory module, opens the refund record (unless proof already did), emits `RETURN_RECEIVED`, and records the audit entry. Returns a `Claimed` value rather than throwing for business rejections.

## Relationships

- **`src/domain-primitives/money.ts`** — `NO_MONEY`, `toMinorUnits` for currency comparison and minor-unit conversion of the handling deduction.
- **`src/infrastructure/http/response.ts`** — `generateReject`, `generateSuccess`, `fieldError` to shape API responses.
- **`src/infrastructure/i18n/context.ts` / `src/infrastructure/i18n/index.ts`** — `t()` for all user-facing error messages.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` with `returnsAuditActions` to log the receipt.
- **`src/kernel/outbox.ts`** — `announceInTransaction` provides the transactional session and event bus; `RETURN_RECEIVED` is emitted here.
- **`src/modules/inventory/index.ts`** — `inventoryService` is called in-transaction to put units back on sale (and backorder) in the same atomic step as the status claim.
- **`src/modules/delivery/index.ts`** — exports `deliveryService` (used for the replace remedy re-shipment), `ActRefusal` (thrown when re-shipment is impossible), and `cheapestStandardShipping` (caps the shipping refund).
- **`src/modules/delivery/services/act.ts`** — the concrete re-shipment act invoked during a replace remedy.
- **`src/modules/access/index.ts`** — `ownOrderFlag` enforces that the caller is the order owner before the transaction proceeds.
- **`src/modules/access/domain/protection.ts`** — provides the protection predicate underlying the access check.
- **`src/modules/orders`** (via `orderService`, `buyerIdOf`, `sumLineItems`) — reads order items for the quote, extends the guarantee on repair.
- **`src/modules/payments`** (via `paymentService`, `OpenedReturnRefund`) — opens the refund record in-transaction; the provider call is deferred post-commit.
- **`../domain`** — all return-specific logic: lifecycle transitions, `accountsOf`, `refundAmountFor`, `resolveRestock`, `takesLastUnit`, `shippingStillOwed`, `wireLines`, `proofOpenedRefund`.
- **`./close`** — `closeReturn` is called when the remedy is replace or repair (closes the return at once).
- **`./projection`** — `syncReturnStatus` keeps the read-model projection in sync after the write.
- **`./refund-due`** — `refundDueFor` checks whether a refund is already due before opening a new record.

## Notes

- **Idempotency via conditional claim.** The status update uses `fromOf('receive')` / `toOf('receive')` as a `WHERE status = 'approved'` guard. Concurrent clicks by multiple staff members all race the same `UPDATE`; only one wins, the others get `{ kind: 'lost' }`. No distributed lock is needed.
- **Two-clock invariant.** The refund *record* is written before the provider call. If the provider is refused, the record stays open and a payment sweep retries it; the `PAYMENT_REFUNDED` event listener closes the return. A return can therefore sit in `received` indefinitely without being "stuck" — someone is always retrying.
- **`proofOpenedRefund` short-circuit.** If the customer's proof-of-sending step already opened and quoted the refund, the receipt skips quoting and record-opening entirely (uses `NO_REFUND` with the stored total). This prevents double-counting.
- **Shipping refund cap.** `cheapestStandardShipping` is computed from the order's item total and currency, independent of what the customer actually paid, to prevent over-refunding on discounted orders.
- **`restock` defaults to full quantity.** A product absent from `input.lines` is restocked in full; an explicit `0` means "broken, keep back." The `badRestock` validator rejects negative counts or counts exceeding the returned quantity.
- **Remedy is immutable after receipt.** It is stamped in the same `claimStatus` write. There is no post-receipt remedy change path in this file.
