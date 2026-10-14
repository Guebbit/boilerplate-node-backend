---
source: src/modules/invoicing/presenter.ts
sha256: 00f06c9fea73004f821eaa8b156249966a839f1c14d8d3297b1cac78be07bffe
generated_at: 2026-10-14T16:07:20.840200+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/presenter.ts

## Purpose

Presentation-layer mapper for the invoicing module. It converts frozen internal documents (`InvoiceDocument`, `CreditNoteDocument`) into the trimmed JSON shapes consumed by `POST /account/export` and the credit-note list endpoint. No other read path in this module serves the raw document — they all render a PDF.

## Key elements

- **`ExportedDocument`** (interface) — the wire shape for a single document in the export envelope: `orderId`, `number`, `issuedAt`, `currency`, `grandTotal`.
- **`presentExportedDocument`** (const fn) — maps an `InvoiceDocument | CreditNoteDocument` to `ExportedDocument`. Coerces `orderId` to `String`.
- **`presentCreditNoteSummary`** (const fn) — maps a `CreditNoteDocument` to `CreditNoteSummary`. Serialises `issuedAt` via `.toISOString()` and surfaces `_id` as `id` plus `refundId`.

## Relationships

- **`src/modules/invoicing/model.ts`** — provides the `InvoiceDocument` and `CreditNoteDocument` types that both presenters consume.
- **`src/types/index.ts`** (`@types`) — provides the `CreditNoteSummary` target type used by `presentCreditNoteSummary`.
- **`src/modules/invoicing/controllers/get-order-credit-notes.ts`** — caller of `presentCreditNoteSummary`; shapes the per-order credit-note list for the API response.

## Notes

- `orderId` is cast with `String()` in `presentExportedDocument` (suggesting the internal type may be a numeric or ObjectId), but `_id` is similarly stringified in `presentCreditNoteSummary`. The two documents carry the order reference in differently-named fields — easy to mix up when extending.
- `issuedAt` handling differs between the two functions: the export shape passes the `Date` through as-is, while the summary shape serialises it to an ISO string. Downstream consumers must handle the distinction.
- This file is intentionally a pure mapping layer (no I/O, no side effects), keeping it safe to test in isolation.
