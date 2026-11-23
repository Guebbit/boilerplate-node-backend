---
source: src/modules/invoicing/controllers/send-pdf.ts
source_sha256: fd5e36f34e9f881b5ad02d4fdd0e2280a3389c42fb3f418273f2b84866600cef
context_sha256: 2c32036601396d63c8b9f9f98fff444bc65548fd2629055ec5c3029b33712547
generated_at: 2026-11-22T05:30:11.059284+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/controllers/send-pdf.ts

## Purpose
Provides the single shared helper that writes a PDF response for the two private document downloads: the invoice and the credit note. It centralizes the status and headers so both endpoints answer identically.

## Key elements
- `sendPdf(response, filename, pdf)` — the only export. Replies with status `200` and these headers, then sends the bytes:
  - `Content-Type: application/pdf`
  - `Content-Disposition: inline; filename="<filename>"`
  - `Cache-Control: private, no-store`
  - `response` is an Express `Response`.
  - `filename` is the name offered to the browser, extension included.
  - `pdf` is a `Buffer` or `Uint8Array` of the rendered bytes.
  - Returns `void`.

## Relationships
- Per the module doc, it is shared by the invoice and credit-note downloads. The neighbors `get-order-invoice.ts` and `get-order-credit-note.ts` are those controllers. Neither is shown here, so the exact call sites are not visible in this file.
- It has no other dependencies besides the Express `Response` type.

## Notes
- The disposition is `inline`, not `attachment`. The file's comment says the frontend holds the blob either way and decides whether to download it or preview it in the same tab.
- `Cache-Control: private, no-store` is deliberate. The documents hold personal and financial data, so neither shared/CDN caches nor the browser's disk cache may store them.
- `filename` is interpolated into the header inside double quotes with no escaping or sanitization. Callers must pass a safe value.
