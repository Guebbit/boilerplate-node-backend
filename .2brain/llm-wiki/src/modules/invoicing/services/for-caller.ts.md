---
source: src/modules/invoicing/services/for-caller.ts
generated_at: 2026-11-22T05:35:07.427181+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/services/for-caller.ts

## Purpose
Provides the three reads behind the invoice and credit-note routes, each answering "for a caller" rather than "by id". The order is first read through the caller's own scope, so a caller who cannot see the order gets the order's own 404. The rule for who may see credit notes lives here, next to the lookups it guards. The controller keeps only request-bound work: the staff-read audit and the PDF bytes.

## Key elements
- `ReadFor<TDocument>`: interface pairing a `document` with its `order` (`OrderDocument`). The order is returned so the staff-read audit can name the buyer.
- `invoiceForCaller(orderId, authContext)`: reads the order through the caller's scope, then the invoice via `findInvoiceForOrder`. Returns `ReadFor<InvoiceDocument>`, or a 404 if the order is unknown or unreadable, or if no invoice has been issued (`ORDER_INVOICE_NOT_ISSUED`).
- `creditNotesForCaller(orderId, authContext, context)`: returns the order's credit notes via `findCreditNotesForOrder`. If the caller may not see credit notes, it returns an empty success list. It returns a 404 only when the order is not found.
- `creditNoteForCaller(orderId, creditNoteId, authContext, context)`: returns one credit note with its order. The result is a 404 `ORDER_CREDIT_NOTE_NOT_ISSUED` if the id is missing or malformed, the caller may not see credit notes, or the note does not exist.
- `mayReadCreditNotes` (private): allows the buyer (`isBuyer`) or any caller holding `display:Payment`. Otherwise it records an `auditForbidden` entry (`reason: missing_permission`, `permission: display:Payment`) and returns `false`. It also returns `false` when there is no `authContext`.
- `creditNoteNotIssued` (private): builds the 404 `ResponseReject` with the localized `invoicing.credit-note-not-issued` message.

## Relationships
- **Orders** (`@modules/orders`, i.e. `orders/index.ts`): supplies the order service used for the scoped order read, plus `isBuyer` and the `OrderDocument` type.
- **`issue-invoice.ts` / `issue-credit-note.ts`**: supplies the underlying lookups `findInvoiceForOrder`, `findCreditNotesForOrder` and `findCreditNoteForOrderById`.
- **`@kernel/ability` and `@kernel/permissions`**: `holds` and `callerForSubject` perform the `display:Payment` check.
- **`@infrastructure/http/response`**: `generateSuccess` and `generateReject` build the return values.
- **`@infrastructure/i18n`**: `t` provides the localized messages.
- **`@infrastructure/observability/forbidden`**: `auditForbidden` records refused credit-note reads.
- **`@infrastructure/persistence/create-repository`**: `isObjectIdString` validates the credit-note id.
- **`../model`**: supplies the `InvoiceDocument` and `CreditNoteDocument` types.

## Notes
- Being able to read the order is not enough to see credit notes. They carry the refund amount and billing address, so staff need `display:Payment`. The warehouse can read orders but is refused.
- A refused caller gets no indication that credit notes exist: the list is empty and the single-note lookup answers "not issued".
- A malformed `creditNoteId` is deliberately left unchecked by the caller. It answers "not issued", but only after the caller has passed the order read.
- The refusal audit is written here, in the service. Route guards do not catch it because the same route serves buyers and staff.
