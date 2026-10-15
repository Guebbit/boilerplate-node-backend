---
source: src/modules/invoicing/config.ts
sha256: f8d49c2b394d5fc17038adbcb2a59028cf51f11dcf51356eadf2376b8e141325
generated_at: 2026-10-15T10:37:41.277250+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/config.ts

## Purpose

Declares the module-level configuration for the invoicing subsystem: which e-invoicing provider is active and how long rendered PDFs are retained before reaping. It deliberately excludes seller identity fields (legal name, VAT, address), which belong to `@modules/orders/config.ts` because the withdrawal notice also prints them and `orders` must not depend on this module.

## Key elements

- **`invoicingConfig`** – the single exported value, produced by `defineConfig`. Shape:
  - `NODE_EINVOICING_PROVIDER` – `text` field, default `'pdf'`, forced to lower-case. Selects which e-invoicing provider implementation is used.
  - `NODE_INVOICE_PDF_RETENTION_DAYS` – `int` field, default `30`, minimum `0`. Controls how many days a rendered invoice PDF is kept before the reap job deletes it.

## Relationships

- **`@infrastructure/config/define`** / **`@infrastructure/config/fields`** – provides the `defineConfig` factory and the `text` / `int` field constructors used to build `invoicingConfig`.
- **`src/modules/invoicing/module.ts`** – registers `invoicingConfig` with the module so it is available at runtime.
- **`src/modules/invoicing/providers/index.ts`** – reads `NODE_EINVOICING_PROVIDER` to pick the concrete provider (e.g. the PDF renderer vs. a future XML provider).
- **`src/modules/invoicing/services/render.ts`** – reads config values during the render/issue flow.
- **`scripts/ops/reap-invoice-pdfs.ts`** – reads `NODE_INVOICE_PDF_RETENTION_DAYS` to determine the cutoff age for PDFs eligible for deletion.

## Notes

- Config is **read per call**, not cached at module-load time. This is intentional: tests can vary values case-by-case without monkey-patching a singleton.
- Do **not** add seller-identity fields (legal name, VAT ID, address) here. They live in `@modules/orders/config.ts` to avoid a circular dependency (`orders` must not import `invoicing`).
