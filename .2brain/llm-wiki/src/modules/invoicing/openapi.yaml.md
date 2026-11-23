---
source: src/modules/invoicing/openapi.yaml
source_sha256: 39a047f8f1d9bc96ac89bd1896c3cb2db5a3d50ebb4785b85234e5008139e810
context_sha256: 475cfe47af80c35f2d2550ab6e1900cda84cc42a080fc05842e6b800873e79d0
generated_at: 2026-11-22T05:32:47.626690+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/openapi.yaml

## Purpose
OpenAPI 3.1 contract fragment for the invoicing module (version `0.1.0`). It declares the module's HTTP operations for downloading frozen invoice and credit-note PDFs and listing credit notes. It also declares the module's error codes and its section of the account data export. A bundler presumably merges it with the shared root contract, since it references `shared/contracts/openapi.root.yaml`.

## Key elements
- **Tag `Invoicing`** (`x-family: Buying`): groups the frozen invoice and credit-note PDFs, issued at payment and at refund.
- **`GET /orders/{id}/invoice`** (`getOrderInvoice`): returns the order's frozen invoice as `application/pdf`.
  - `Content-Disposition` is `invoice-<number>.pdf`.
  - `x-cache: no-store`.
  - Responses: 401, 404, 429 and 503.
- **`GET /orders/{id}/credit-notes`** (`listOrderCreditNotes`): returns a `CreditNotesResponse` (unpaged, oldest first). It is empty when the order was never refunded, has no invoice, or the caller may not read its money.
- **`GET /orders/{id}/credit-notes/{creditNoteId}`** (`getOrderCreditNote`): returns one credit note as PDF.
  - `Content-Disposition` is `credit-note-<number>.pdf`.
  - `x-cache: no-store`.
  - Responses: 401, 404, 429 and 503.
- **`x-error-codes`**:
  - `ORDER_INVOICE_NOT_ISSUED` (404).
  - `ORDER_CREDIT_NOTE_NOT_ISSUED` (404).
  - Each operation maps its 404 to the matching code.
- **`x-personal-data.invoicing`**: the module's section of `POST /account/export`. It is an object with required `invoices` and `creditNotes` arrays of `ExportInvoiceDocument`, and the arrays are empty rather than absent.
- **Schemas**:
  - `CreditNoteSummary`: `id`, `number`, `issuedAt`, `currency`, `grandTotal`, `reason` (`refund` | `correction`), and optional `refundId`, which is absent on a correction.
  - `CreditNotesResponse`: `{ items: CreditNoteSummary[] }`.
  - `ExportInvoiceDocument`: `orderId`, `number`, `issuedAt`, `currency`, `grandTotal`.

## Relationships
- `src/modules/invoicing/templates/documents/logo.svg` is the only graph neighbor. This file does not reference it, and it does not appear in the spec. It is presumably used by the PDF document templates that render the documents this contract serves.
- The file's actual `$ref` dependencies are the shared root contract (`IdPathParam`, `Unauthorized`, `NotFound`, `TooManyRequests`, `ServiceUnavailable`, `Id`, `CurrencyCode`, `NonNegativeDecimalAmount`).

## Notes
- All three operations require `bearerAuth`.
- The invoice and credit-note PDFs are rendered once and frozen, not re-rendered from current config. Invoice numbers come from a gap-free series. An order that is unpaid, or whose invoice listener failed, has no invoice yet and returns 404.
- The 404 responses are deliberately indistinguishable between a missing document, another user's order, and staff lacking `display:Payment`.
- The 503 means every render slot and the bounded queue behind them are full, and `Retry-After` says when to retry. A stored copy never gets a 503. The 429 comes from a rate limiter (`invoicingLimiter`) placed in front of the invoice route.
- `reason: correction` credit notes arise when staff correct the buyer's details. The old invoice is cancelled and reissued, and no money moves.
- Schemas are `additionalProperties: false`. Export rows deliberately omit lines, seller identity and VAT breakdown.
