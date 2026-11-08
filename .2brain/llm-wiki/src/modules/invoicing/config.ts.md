---
source: src/modules/invoicing/config.ts
sha256: 6be0205fb20567cfb6804b23e776c9d9f48a4ddaf36ce58c012f4c861b2bf020
generated_at: 2026-11-08T06:09:25.604942+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/config.ts

## Purpose

Defines the runtime configuration schema for the invoicing module—specifically which e-invoicing provider is used and how long invoice PDFs and buyer blocks are retained. It exists so these knobs are validated, typed, and overridable per environment (or per test) without hard-coding values in service code.

## Key elements

- **`invoicingConfig`** (export) — The single config object, built via `defineConfig({ name: 'invoicing', shape: { … } })`. Three fields:
  - `NODE_EINVOICING_PROVIDER` — `text`, default `'pdf'`, lowercased. Selects the e-invoicing provider implementation.
  - `NODE_INVOICE_PDF_RETENTION_DAYS` — `int`, default `30`, min `0`. Days an issued invoice PDF is kept before deletion.
  - `NODE_INVOICE_BUYER_RETENTION_YEARS` — `int`, default `10`, min `1`. Years after the issue year-end that the buyer block remains on a document.

## Relationships

- **`src/infrastructure/config/define.ts`** — Provides `defineConfig`, the factory that stamps the `name` and `shape` into a validated config instance.
- **`src/infrastructure/config/fields.ts`** — Provides the `text` and `int` field-descriptor builders used to declare each shape key.
- **`src/modules/invoicing/providers/index.ts`** — Consumes `NODE_EINVOICING_PROVIDER` to resolve the active e-invoicing provider.
- **`src/modules/invoicing/services/retention.ts`** — Reads the two retention fields to drive cleanup/purge schedules.
- **`src/modules/invoicing/module.ts`** — Registers `invoicingConfig` as part of the module's public config surface.

## Notes

- The module doc comment explicitly notes that the *seller's* identity (legal name, VAT, address) is **not** here; it lives in `account` / `services/operator-identity.ts` and is read per call so tests can vary it independently.
- Field names follow the `NODE_` prefix convention shared with other module configs in this repo.
