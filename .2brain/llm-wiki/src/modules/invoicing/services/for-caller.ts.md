---
source: src/modules/invoicing/services/for-caller.ts
sha256: 1456534f94ed020b7ae118b235d40068d33f55b35c12499e989d77d05f95e62c
generated_at: 2026-11-08T06:14:13.644786+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/for-caller.ts

## Purpose

Provides the three caller-scoped read operations behind the invoice and credit-note routes. Each reads the order through the caller's own scope first (so an unauthorized caller gets the order's natural 404), then resolves the document. Credit-note visibility is gated here with a `display:Payment` check that goes beyond basic order readability.

## Key elements

- **`ReadFor<TDocument>`** — interface pairing a document with its parent `OrderDocument` (used by both invoice and credit-note reads; the order is included so the controller can name the buyer in a staff-read audit).
- **`invoiceForCaller(orderId, authContext)`** — resolves the order via `orderService.getForCaller`, then calls `findInvoiceForOrder`. Returns the invoice + order, or a 404 (order not found / not yet issued).
- **`creditNotesForCaller(orderId, authContext, context)`** — resolves the order, checks `mayReadCreditNotes`, returns the notes array or an **empty array** (200) when permission is denied.
- **`creditNoteForCaller(orderId, creditNoteId, authContext, context)`** — resolves the order, validates `creditNoteId` and permission, fetches the single note. A malformed ID or permission denial both yield the "not issued" 404.
- **`mayReadCreditNotes(order, authContext, context)`** — internal gate: allows the buyer or staff holding `display:Payment`; audits a forbidden attempt via `auditForbidden` on denial.
- **`creditNoteNotIssued()`** — internal 404 helper returning the `ORDER_CREDIT_NOTE_NOT_ISSUED` error with a localized message.

## Relationships

- **`@modules/orders`** — calls `orderService.getForCaller` to read the order within the caller's scope; uses `isBuyer` to shortcut the permission check.
- **`@kernel/ability` / `@kernel/permissions`** — `holds(callerForSubject(authContext, 'Payment'), 'display', 'Payment')` is the sole permission gate for credit-note visibility.
- **`@infrastructure/observability/forbidden`** — `auditForbidden` logs a denial inside `mayReadCreditNotes` because no route-level guard sees this case.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape every return value.
- **`@infrastructure/http/ids`** — `isValidObjectId` guards `creditNoteId` in `creditNoteForCaller`.
- **`@infrastructure/i18n`** — `t` supplies localized messages for 404 responses.
- **`./issue-invoice`** — `findInvoiceForOrder` performs the actual invoice document lookup.
- **`./issue-credit-note`** — `findCreditNotesForOrder` / `findCreditNoteForOrderById` perform the actual credit-note lookups.
- **`../model`** — imports `InvoiceDocument` and `CreditNoteDocument` type definitions.

## Notes

- A permission-denied credit-note read is **indistinguishable** from "not issued" (same 404 code and message). This is intentional: it avoids leaking the existence of credit notes to callers who can read the order but not the money.
- `creditNotesForCaller` returns **200 with an empty array** (not a 403) when permission is denied, while `creditNoteForCaller` returns the 404 "not issued" for the same denial.
- `creditNoteId` is **not** pre-validated before the permission check; a malformed ID simply falls into the same "not issued" branch as a permission denial.
- The `display:Payment` permission (not `display:Order`) is what gates credit notes, explicitly excluding roles like warehouse staff who can read orders but should not see refund amounts or billing addresses.
- The `context` parameter (separate from `authContext`) exists solely to carry the caller identity into `auditForbidden`.
