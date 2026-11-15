---
source: src/modules/invoicing/services/for-caller.ts
sha256: 2c1aeabf916a3b5623e559cc0f7080c7f63c07edca47091cee7218b28251e006
generated_at: 2026-11-14T20:13:03.959220+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/for-caller.ts

## Purpose

Provides the three caller-scoped read operations behind the invoice and credit-note routes. Each function resolves the order through the caller's own scope first (so an unauthorized caller simply receives a 404), then layers the credit-note-specific permission check on top. The controller is left to handle only what requires the raw request (staff-read audit, PDF streaming).

## Key elements

- **`ReadFor<TDocument>`** — generic interface pairing a document with its parent `OrderDocument`; used by the single-invoice and single-credit-note reads.
- **`invoiceForCaller(orderId, authContext)`** — returns the order's invoice or a 404 (unknown order / no invoice yet).
- **`creditNotesForCaller(orderId, authContext, context)`** — returns the order's credit-note list, or an empty array when the caller lacks `display:Payment`. Never reveals existence.
- **`creditNoteForCaller(orderId, creditNoteId, authContext, context)`** — returns a single credit note; malformed `creditNoteId` or missing permission both yield the shared "not issued" 404.
- **`mayReadCreditNotes`** *(private)* — buyer check → `display:Payment` ability check → audit-forbidden fallback. Returns `boolean`.
- **`creditNoteNotIssued`** *(private)* — shared 404 response with the `ORDER_CREDIT_NOTE_NOT_ISSUED` code and i18n message.

## Relationships

- **`src/modules/orders/index.ts`** — every read begins with `orderService.getForCaller`, which enforces the caller's own scope; `isBuyer` is the first gate in `mayReadCreditNotes`.
- **`src/modules/orders/model.ts`** — source of the `OrderDocument` type used throughout.
- **`src/modules/orders/services/index.ts`** — provides `orderService`, the scoped order read.
- **`src/modules/invoicing/services/issue-invoice.ts`** — supplies `findInvoiceForOrder`, the actual DB lookup for the invoice.
- **`src/modules/invoicing/services/issue-credit-note.ts`** — supplies `findCreditNotesForOrder` and `findCreditNoteForOrderById`.
- **`src/modules/invoicing/services/index.ts`** — re-exports these three functions for controller consumption.
- **`src/kernel/ability.ts`** — `holds` evaluates the `display:Payment` ability for staff callers.
- **`src/kernel/permissions.ts`** — `callerForSubject` resolves the ability subject for the caller.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape every return value.
- **`src/infrastructure/observability/forbidden.ts`** — `auditForbidden` records a denied credit-note read (no route guard covers this case).
- **`src/infrastructure/i18n/index.ts`** — `t` localizes error messages.
- **`src/infrastructure/persistence/create-repository.ts`** — `isObjectIdString` guards `creditNoteId` before it reaches the DB layer.
- **`src/modules/invoicing/model.ts`** — `InvoiceDocument`, `CreditNoteDocument` type definitions.

## Notes

- Permission refusals on credit notes are **silent** (empty array or "not issued" 404) so a caller cannot probe whether notes exist. The only trace is the `auditForbidden` entry.
- `creditNoteId` is **not** validated as a valid ObjectId before the permission check; a malformed id is deliberately indistinguishable from a missing one.
- The `context: CallerContext` parameter on the credit-note functions exists solely to populate the audit log entry; the two credit-note functions require it while `invoiceForCaller` does not.
