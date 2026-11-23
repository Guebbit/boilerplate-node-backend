---
source: src/modules/returns/services/receive.ts
source_sha256: a8b922368abc7c23bb45456c00afb218889a4091ef3b3dc6002316eab98cd345
context_sha256: 5f6c19a90c81dcf9c71c0a2e5639b16c21cafbcf0602ad3f37ff9e07f1688cad
generated_at: 2026-11-22T07:32:01.877213+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/receive.ts

## Purpose
Implements the "goods arrived" step of a return: `approved → received`, units restocked, and the customer's remedy applied, after which the return is `closed`. It keeps two facts apart: *received* (a parcel fact, where the status claim and restock share one transaction) and *closed* (a money fact, where the refund record is opened in that same transaction and only the provider call happens after commit). Remedies follow the EU guarantee rules (Directive 2019/771 Art. 13): `refund`, `replace`, or `repair`.

## Key elements
- `ReceiveReturnInput`: staff input with `handlingDeduction`, `lines` (per-product restock counts), `remedy` (absent means refund), and `paidOutside`. `paidOutside` needs `create:Refund` as well as `receive:Return`.
- `notReceivable()`: builds the 409 `RETURN_NOT_RECEIVABLE` rejection.
- `badRestock(verdict)`: builds a 422 field error on `lines.<i>.restock`.
- `NO_REFUND`: the all-zero `RefundBreakdown` used for replace and repair.
- `Claimed`: the result type of the transaction. Its variants are `deduction-too-high`, `refused`, `lost` (lost race), and `received`, which carries the breakdown, the opened refund record (or `null`) and `openedOnProof`.
- `stampRestocked` / `restockedLines`: helpers that write `lines.<i>.restocked` counts and build the list of lines that actually go back on sale (zero counts dropped).
- `quote(returned, order, earlier, handlingDeduction)` (exported): computes what the return is owed from its frozen lines and the order's money, taking into account the order's other returns. It includes the shipping only if this return brings the order whole, and only the part not already refunded.
- `handOverRemedy`: runs inside the receipt transaction. For `replace` it calls `deliveryService.reopenForReplacement`; for `repair` it calls `orderService.extendGuarantee` (12 months, once per order); for a refund it does nothing. It can throw `ActRefusal`.
- `claimAndRestock`: the core transaction, run through `announceInTransaction`. It:
  - locks the order row and loads every return on the order;
  - decides the refund breakdown (reusing the amount if the proof of sending already opened the refund, quoting it for a refund remedy, or using `NO_REFUND`);
  - returns `deduction-too-high` if the quote fails;
  - claims the status conditionally via `returnRepository.claimStatus`, using `returnLifecycle` from/to for `receive`, and stamps `receivedAt` and `remedy`.

  The visible part of the file ends partway through this function, so the later steps (the restock itself, the refund record and the `return.received` event) are not covered here.

## Relationships
- `@infrastructure/http/response` and `@infrastructure/i18n`: build the localized 409/422 rejections and field errors.
- `@kernel/outbox` (`announceInTransaction`): wraps the receipt in a transaction that can publish events.
- `@kernel/ability` (`holds`), `@modules/access` (`ownOrderFlag`): permission checks, such as `create:Refund` for `paidOutside`.
- `@infrastructure/observability/audit` (`recordAudit`) with `../audit`: audit trail for receiving. It is imported, but its use is not visible in the shown part.
- `@modules/delivery` (`deliveryService`, `cheapestStandardShipping`, `ActRefusal`): reopens order lines for a replacement, supplies the cheapest standard shipping rate for the quote, and defines the refusal error that aborts the transaction.
- `@modules/orders` (`orderService`, `sumLineItems`, `buyerIdOf`): extends the guarantee for a repair and supplies the order totals.
- `@modules/payments` (`paymentService`, `OpenedReturnRefund`): opens the refund record and makes the provider call.
- `@modules/inventory` (`inventoryService`): restocks the returned units.
- `@domain-primitives/money`: money helpers (`NO_MONEY`, `padDecimal`, `toMinorUnits`).
- `../repository` (`returnRepository`): `lockOrder`, `findByOrderId` and `claimStatus`.
- `../domain`: lifecycle and refund rules (`returnLifecycle`, `refundAmountFor`, `resolveRestock`, `takesLastUnit`, `shippingStillOwed`, `accountsOf`, `proofOpenedRefund`).
- `../events` (`RETURN_RECEIVED`), `./close` (`closeReturn`), `./projection` (`syncReturnStatus`), `./outcome` (`badRemedy`, `forbidden`), `./refund-due` (`refundDueFor`): the event, the closing step, the status projection, shared rejections and the refund-due helper.

## Notes
- The status move is conditional on `approved`, so concurrent staff clicks restock and refund only once.
- The order lock row is taken before quoting so two racing receipts cannot both claim the delivery charge.
- If the proof of sending already opened and quoted the refund (`proofOpenedRefund`), receipt neither re-quotes nor opens a second record.
- If the provider call is refused, the refund record stays open. The payment sweep retries it, and the `PAYMENT_REFUNDED` listener closes the return when the refund lands, so a return is never stuck `received` unretried.
- Replace and repair move no money and close the return in the same transaction. `paidOutside` opens the refund already settled by hand, so no provider is asked.
