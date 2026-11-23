---
source: src/modules/invoicing/config.ts
source_sha256: 1ffc65bbc9f89b950e2027c91786d92c5440f21242e373bfab2fb17e51af0ca4
context_sha256: 6ea0a45006e0fd010f44d99710d0c851320d8e19116ff032c1637f065d320e95
generated_at: 2026-11-22T05:29:25.614191+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/config.ts

## Purpose
Declares the `invoicing` configuration for how an invoice document is issued: which e-invoicing provider is used, and how long stored PDFs and buyer data are retained. The seller's own identity (legal name, VAT number, address) is not here. It lives in `account` (`src/modules/account/services/operator-identity.ts`). The module doc says the config is read per call, so a test can vary it per case.

## Key elements
- `invoicingConfig`: the exported config, built with `defineConfig({ name: 'invoicing', shape: {...} })`. It has three fields:
  - `NODE_EINVOICING_PROVIDER`: `text`, default `'pdf'`, lowercased (`case: 'lower'`). It names the e-invoicing provider the port resolves to.
  - `NODE_INVOICE_PDF_RETENTION_DAYS`: `int`, default `30`, min `0`. It sets the days a stored PDF is kept before the reaper removes it. `0` keeps none.
  - `NODE_INVOICE_BUYER_RETENTION_YEARS`: `int`, default `10`, min `1`. It sets the years after the end of the issue year that the buyer block stays on a document.

## Relationships
- Uses `defineConfig` from `src/infrastructure/config/define.ts` and the `int` and `text` field builders from `src/infrastructure/config/fields.ts`.
- The neighbors `src/modules/invoicing/jobs.ts`, `src/modules/invoicing/module.ts`, `src/modules/invoicing/providers/index.ts`, `src/modules/invoicing/services/render.ts` and `src/modules/invoicing/services/retention.ts` are linked to this file in the dependency graph. The provider setting, the PDF retention (reaper) and the buyer retention described in the field comments appear to relate to the providers, jobs and retention/render services. The file itself doesn't show how each one reads the config.

## Notes
- All values come from `NODE_*` environment-style keys, with defaults defined in the file.
- The `min` bounds differ on purpose. PDF retention may be `0` (store nothing), while buyer retention must be at least 1 year.
