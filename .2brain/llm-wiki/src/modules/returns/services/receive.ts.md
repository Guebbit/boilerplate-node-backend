---
source: src/modules/returns/services/receive.ts
sha256: 386d8efaa3fe030df16f509145d46530a503e45bc9477cc1eccb0dcc83ae6270
generated_at: 2026-10-29T05:44:59.606505+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/receive.ts

## Purpose

Handles the "goods arrived" step of a return: transitions a return from `approved → received`, restocks the units that go back on sale, resolves the remedy (refund, replace, or repair), and opens the refund record — all in a single transaction guarded by an order-level lock. The file keeps the receipt fact (parcel + restock) atomic while deliberately deferring the money fact (provider refund call) to an outbox-driven sweep, so a received return can never be stuck without a retry.

## Key elements

- **`ReceiveReturnInput`** — Staff-facing input: optional `handlingDeduction` (Art. 14(2) charge), optional per-line `restock` counts, and optional `remedy` (defaults to refund).
- **`Claimed`** — Discriminated union returned by the core transaction: `deduction-too-high`, `refused` (409/422 reject), `lost` (lost the conditional race), or `received` with the document, refund breakdown, and the opened refund record (or `null`).
- **`quote()`** — Computes the refund breakdown from the return's frozen lines, the order's shipping, earlier settlements on the same order, and the handling deduction. Decides whether this return is the one that "brings the order whole" (and thus claims the delivery).
- **`claimAndRestock()`** — The main transaction (wrapped in `announceInTransaction`): locks the order row, re-reads all returns, quotes, performs the conditional `approved → received` claim, calls `inventoryService.restockReturnedLines`, invokes `handOverRemedy`, appends an order timeline entry, and opens the refund record. Emits `RETURN_RECEIVED` via the outbox.
- **`handOverRemedy()`** — For `replace`: delegates to `deliveryService.reopenForReplacement`. For `repair`: calls `orderService.extendGuarantee`. For `refund`: no-op (money is handled by the opened refund record + sweep).
- **`restockedLines()` / `stampRestocked()`** — Helpers to derive the sellable sub-list and the dotted-field `lines.<i>.restocked` stamp written onto the return document.
- **Response helpers** (`notReceivable`, `badRestock`, `badRemedyFor`, `deductionOnGuarantee`) — Build the specific 409/422 `ResponseReject` objects with i18n messages and error codes.

## Relationships

- **`@infrastructure/http/response`** — `generateReject`, `generateSuccess`, `fieldError` shape every HTTP response this service returns.
- **`@infrastructure/i18n`** — `t()` provides all user-facing error messages.
- **`@infrastructure/observability/audit`** — `recordAudit` logs the receipt action (imported; used in the truncated portion).
- **`@kernel/outbox`** — `announceInTransaction` wraps the whole receipt in a transaction that also enqueues outbox events.
- **`@modules/inventory`** — `inventoryService.restockReturnedLines` puts units back on sale inside the same transaction.
- **`@modules/delivery` / `delivery/services/act`** — `deliveryService.reopenForReplacement` re-sends replaced units; `ActRefusal` is the error type that aborts the transaction when the order cannot ship again.
- **`@modules/delivery/domain/rates`** — `cheapestStandardShipping` feeds the shipping portion of the refund quote.
- **`@modules/access`** — `ownOrderFlag` (imported) used for caller-scoping checks in the truncated portion.
- **`@modules/payments`** — `paymentService` opens the `OpenedReturnRefund` record in-transaction; the provider call and `PAYMENT_REFUNDED` listener (in `closeReturn`) settle it later.

## Notes

- The status claim is **conditional** (`approved` only) — two staff members clicking simultaneously will have exactly one win; the other gets a 409 (`RETURN_NOT_RECEIVABLE`). This is what guarantees single-execution of restock and refund-record creation.
- `restock` per line is optional: an absent entry means "restock the full returned quantity." A value of `0` means the unit is damaged and writes **no** inventory movement at all.
- For `replace` and `repair`, the refund breakdown is always `NO_REFUND` (zero); money is never moved, and the return closes immediately in the same transaction (via `closeReturn`, imported but called in the truncated section).
- The refund **record** is opened in-transaction (durable), but the actual **provider refund call** happens after commit. If the provider refuses, the record stays open and the payment sweep retries until `PAYMENT_REFUNDED` fires and `closeReturn` finalises the state.
- `cheapestStandardShipping` is computed from the order's total goods price (not a stored field), so the shipping portion of the refund is capped at what a standard shipment would have cost.
