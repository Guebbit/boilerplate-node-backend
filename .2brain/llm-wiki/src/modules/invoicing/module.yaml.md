---
source: src/modules/invoicing/module.yaml
sha256: 64888cc98c0d9964de8593631b443f7dcd63fec86ff55f0e630c6fbe20587348
generated_at: 2026-11-08T06:12:03.450290+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/module.yaml

## Purpose

Module manifest for the invoicing subdomain. Declares the module's identity (supporting subdomain, shop group), its upstream dependencies, the rate-limit budget governing PDF renders, and the two nightly retention jobs that clean up stored invoices and credit notes.

## Key elements

- **`summary` / `subdomain` / `group`** — Identifies the module as the frozen-invoice / credit-note document layer within the shop group.
- **`dependsOn`** — Lists four upstream modules (`account`, `orders`, `payments`, `shop`) with inline comments explaining *why* each is needed (seller block, VAT/jurisdiction, refund trigger, zone counting).
- **`rateLimits.invoicingRender`** — Rate-limit definition for `GET /orders/{id}/invoice` and `GET /orders/{id}/credit-notes/{creditNoteId}`. Keyed on the signed-in **ACCOUNT** (not address) because every hit spawns a Chromium launch. Default cap 20 per shared window; override via `NODE_INVOICING_RATE_LIMIT_MAX`. Audited.
- **`jobs.reapInvoicePdfs`** — Cron `8 2 * * *`. Deletes stored invoice/credit-note PDFs past their retention window; a later download re-renders on demand.
- **`jobs.reapInvoices`** — Cron `14 2 * * *`. Blanks the buyer block on an invoice or credit note once tax retention has expired; the numbered document and its cached PDF remain deleted.

## Relationships

- **`src/modules/invoicing/module.ts`** — This YAML is the declarative config for that file; the TS module implements the render endpoints and document logic the YAML describes.
- **`src/modules/payments/module.yaml`** — Invoicing depends on `payments` for the `PAYMENT_REFUNDED` event, which is the trigger from which a credit note is issued.
- **`src/modules/delivery/module.yaml`** — No direct dependency or interaction is expressed in this file.

## Notes

- The rate-limit key is deliberately **account-scoped**, not address-scoped. The inline comment explains the rationale: an address-keyed budget would let one account behind a shared address starve all other callers. Changing the key dimension is non-trivial.
- The two `reap` jobs run only six minutes apart (02:08 then 02:14) but do *different* work: the first deletes PDFs, the second blanks PII. The ordering means a buyer block is blanked *after* the PDF has already been deleted for the same record.
- `windowMs: shared` on the rate limit means the window is defined globally elsewhere; only the per-window max is specified here.
