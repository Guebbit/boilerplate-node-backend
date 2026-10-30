---
source: src/modules/invoicing/controllers/send-pdf.ts
sha256: 93c8dbb450e2ae38073d5ce18e4c7d8dd5e447b7cff0c791139ebda669f75f67
generated_at: 2026-10-29T04:10:40.565351+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/controllers/send-pdf.ts

## Purpose
Shared helper that serialises a rendered PDF buffer into a private, uncached Express response. Both the invoice and credit-note download endpoints call this single function, so the response headers (content type, disposition, cache policy) are defined in one place.

## Key elements
- **`sendPdf(response, filename, pdf)`** (exported) — Sets `200`, `Content-Type: application/pdf`, `Content-Disposition: inline; filename="…"`, and `Cache-Control: private, no-store`, then sends the raw PDF bytes (`Buffer` or `Uint8Array`).

## Relationships
- **`get-order-invoice.ts`** — Renders an invoice PDF and delegates the byte delivery to `sendPdf`.
- **`get-order-credit-note.ts`** — Renders a credit-note PDF and delegates the byte delivery to `sendPdf`.

Both controllers are the sole callers; no other module imports from this file.

## Notes
- `Content-Disposition` is deliberately `inline`, not `attachment`. The consuming frontend receives an opaque blob and decides whether to trigger a download or open a same-tab preview.
- `Cache-Control: private, no-store` is a privacy guard: invoices and credit notes contain personal/financial data, so neither shared caches (CDN) nor the browser's disk cache may retain them.
