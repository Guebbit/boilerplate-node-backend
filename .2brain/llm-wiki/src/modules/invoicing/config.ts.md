---
source: src/modules/invoicing/config.ts
sha256: 7960d42d58b4aae7bff8db649e526c14b68bd567514a67771b75a1f61c8ab23d
generated_at: 2026-10-29T04:10:03.892290+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/config.ts

## Purpose

Defines the runtime configuration surface for the invoicing module—specifically which e-invoicing provider is active and how long rendered PDFs and buyer identity blocks are retained. It exists as a separate, per-call-readable config so that individual tests can override values without mutating shared state, and so that seller-identity fields (which belong to the `orders` module) stay decoupled.

## Key elements

- **`invoicingConfig`** — The single exported config object, built via `defineConfig` with name `'invoicing'`. Contains three shape fields:
  - `NODE_EINVOICING_PROVIDER` (`text`, default `'pdf'`, lower-cased) — selects which e-invoicing provider is used.
  - `NODE_INVOICE_PDF_RETENTION_DAYS` (`int`, default `30`, min `0`) — how many days a rendered PDF is kept.
  - `NODE_INVOICE_BUYER_RETENTION_YEARS` (`int`, default `10`, min `1`) — how many years after the issue year the buyer block remains on the document.

## Relationships

- **`src/infrastructure/config/define.ts`** — Provides `defineConfig`, the function used to construct `invoicingConfig`.
- **`src/infrastructure/config/fields.ts`** — Provides the `text` and `int` field-constructor helpers used for the three shape fields.
- **`src/modules/invoicing/module.ts`** — Registers/exposes `invoicingConfig` as part of the module's public surface.
- **`src/modules/invoicing/providers/index.ts`** — Reads `NODE_EINVOICING_PROVIDER` to select the active provider implementation.
- **`src/modules/invoicing/services/retention.ts`** — Reads `NODE_INVOICE_PDF_RETENTION_DAYS` and `NODE_INVOICE_BUYER_RETENTION_YEARS` to govern cleanup of stored PDFs and buyer blocks.
- **`src/modules/invoicing/services/render.ts`** — Consumes the config (provider choice, retention) when producing invoice documents.
- **`src/modules/invoicing/jobs.ts`** — Schedules work (e.g., retention sweeps) that depends on the retention values defined here.

## Notes

- The config is intentionally **read per call** (not cached at module level) so tests can vary values case-by-case.
- Seller identity (legal name, VAT, address) is deliberately **not** here; it lives in `@modules/orders/config.ts` because the `orders` module must not import from `invoicing`. The withdrawal-notice rendering reuses that orders-side config.
- `NODE_INVOICE_BUYER_RETENTION_YEARS` counts years **after the end of the issue year**, not from the invoice date.
