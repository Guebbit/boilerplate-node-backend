---
source: src/modules/invoicing/controllers/send-pdf.ts
sha256: 93c8dbb450e2ae38073d5ce18e4c7d8dd5e447b7cff0c791139ebda669f75f67
generated_at: 2026-11-08T06:10:06.897134+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/controllers/send-pdf.ts

## Purpose

Single-purpose utility that writes a rendered PDF buffer back to the client with the correct headers (inline disposition, no caching). It exists so the two PDF-download controllers (invoice and credit note) share one response path instead of duplicating header logic.

## Key elements

- **`sendPdf(response, filename, pdf)`** — the sole export. Sets `Content-Type: application/pdf`, `Content-Disposition: inline; filename="…"`, `Cache-Control: private, no-store`, then calls `response.send(pdf)`. Accepts `Buffer | Uint8Array` as the payload.

## Relationships

- **`get-order-invoice.ts`** — imports `sendPdf` to deliver the rendered invoice PDF to the caller.
- **`get-order-credit-note.ts`** — imports `sendPdf` to deliver the rendered credit-note PDF to the caller.

Both controllers render their document to bytes and hand the result to this function; all response-header concerns live here.

## Notes

- `Content-Disposition` is deliberately `inline`, not `attachment`. The frontend owns the blob and decides between same-tab preview or download.
- `Cache-Control: private, no-store` is intentional — the PDFs contain personal/financial data and must never be held in a shared CDN or browser disk cache.
- The function is `void`; it does not return the response, so it cannot be chained by callers.
