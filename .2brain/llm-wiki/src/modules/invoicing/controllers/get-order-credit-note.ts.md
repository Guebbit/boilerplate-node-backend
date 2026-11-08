---
source: src/modules/invoicing/controllers/get-order-credit-note.ts
sha256: 630b0d924848a65011d4495230ab403bf722af7822c60bb45d59bc277499931d
generated_at: 2026-11-08T06:09:38.041651+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/controllers/get-order-credit-note.ts

## Purpose

HTTP controller that serves a single order's credit-note PDF on `GET /orders/:id/credit-notes/:creditNoteId`. It is the credit-note counterpart to `get-order-invoice`: returns **200** with the rendered PDF, **404** when the credit note doesn't exist, belongs to another order, or the order itself is missing, and **500** if PDF rendering fails.

## Key elements

- **`getOrderCreditNote`** (exported) — Express route handler. Validates the `:id` param, resolves the credit note via the invoicing service (scope-checked against the caller), records a staff-read audit event, renders the PDF, and streams it back with filename `credit-note-<number>.pdf`.

## Relationships

- **`src/modules/invoicing/services/index.ts`** — calls `invoicingService.creditNoteForCaller` (authorization + lookup) and `invoicingService.renderCreditNotePdf` (binary generation).
- **`src/modules/invoicing/audit.ts`** — reads `invoicingAuditActions.ADMIN_CREDIT_NOTE_VIEWED` as the audit action name.
- **`src/modules/invoicing/controllers/send-pdf.ts`** — delegates final byte-streaming to `sendPdf(response, filename, buffer)`.
- **`src/modules/invoicing/routes.ts`** — registers this handler on the `GET /orders/:id/credit-notes/:creditNoteId` path.
- **`src/infrastructure/http/ids.ts`** — uses `requireId` to extract and validate the `:id` path param.
- **`src/infrastructure/http/controller.ts`** — uses `refused` (early 4xx/403 short-circuit) and `catchAs` (unified 500 mapping).
- **`src/infrastructure/http/request.ts`** — uses `callerContextOf` to derive the authenticated caller's identity for scoping.
- **`src/kernel/staff-read.ts`** — calls `recordStaffRead` to log that a staff member viewed the credit note.
- **`src/modules/orders/index.ts`** — imports `buyerIdOf` to resolve the order's buyer for the audit `ownerId`.

## Notes

- **`targetId` uses `creditNote._id`, not `creditNote.number`.** The number can repeat across the invoice series; the `_id` is the stable row identifier. This is called out explicitly in a code comment.
- **Access model:** non-admin callers are restricted to their own order's credit note; staff callers additionally require the "payments" staff-read permission. The scoping logic lives inside `invoicingService.creditNoteForCaller`, not here.
- The file is intentionally the structural twin of `get-order-invoice.ts`; changes to one often need to be mirrored in the other.
