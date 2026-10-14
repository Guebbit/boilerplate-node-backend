---
source: src/modules/invoicing/providers/index.ts
sha256: 1469d8628f60306aad44fcb3b906b9a6956aa364d2d8f8a996ad9a7db4d943cd
generated_at: 2026-10-14T16:07:48.655512+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/providers/index.ts

## Purpose

Defines the e-invoicing provider **port** (interface + registry) — the seam through which any national e-invoicing network is wired in as a deployment choice via `NODE_EINVOICING_PROVIDER`. Ships a single implementation (`pdf`); a live deployment adds one file and one `registerEInvoicingProvider` call without editing this file. The pattern mirrors `payments/providers`.

## Key elements

- **`EInvoicingDocumentKind`** — union `'invoice' | 'creditNote'`; determines title/disclaimer when rendering.
- **`EInvoicingDocument`** — the flat, frozen data blob handed to a provider (line items, tax rows, totals, party info, optional `reversalOf`). Deliberately **not** a Mongoose document so a provider cannot touch the database.
- **`EInvoicingArtifact`** — `{ contentType, bytes }` returned by `issue`.
- **`EInvoicingProvider`** — the interface every implementation satisfies: a `name` string and `issue(document): Promise<EInvoicingArtifact>`.
- **`registry`** (module-private) — `createProviderRegistry<EInvoicingProvider>` pre-populated with `{ pdf: pdfEInvoicingProvider }`.
- **`registerEInvoicingProvider(name, provider)`** — adds or overrides an implementation at runtime (e.g. in tests).
- **`resolveEInvoicingProvider()`** — reads `NODE_EINVOICING_PROVIDER` from `invoicingConfig()` on every call (not memoised) and returns the matching provider; throws if the name is unknown.
- **`invoicingProviderProbe`** — a `defineConfig` boot probe that calls `probe(resolveEInvoicingProvider)` so a typo in the env var fails at startup rather than on the first invoice.

## Relationships

- **`src/infrastructure/runtime/provider-registry.ts`** — provides `createProviderRegistry` and `requireProvider`, the generic registry mechanism this file builds on.
- **`src/infrastructure/config/define.ts`** — provides `defineConfig` and `probe` used to construct the startup probe.
- **`src/modules/invoicing/config.ts`** — source of the `NODE_EINVOICING_PROVIDER` default value read by `resolveEInvoicingProvider`.
- **`src/modules/invoicing/providers/pdf.ts`** — the sole shipped implementation; its `pdfEInvoicingProvider` is registered at module load.
- **`src/modules/invoicing/model.ts`** — supplies the `InvoiceLine`, `InvoiceParty`, and `InvoiceSeller` types reused in `EInvoicingDocument`.
- **`src/types/index.ts`** — supplies the `OrderTaxSummaryRow` type for `taxSummary` and `shippingByRate`.

## Notes

- **Not memoised:** `resolveEInvoicingProvider` re-reads config on every call, matching the `payments/providers` convention so that test overrides via `registerEInvoicingProvider` take effect immediately without clearing a cache.
- **Circular-import avoidance:** `invoicingProviderProbe` uses a shape-less `{}` config slice because the resolver imports `invoicingConfig`, and the config module therefore cannot import the resolver back.
- **SdI / Peppol are intentionally absent.** The doc block states that a real transmission adapter must also report a delivery outcome (transmission id, rejection reason) back onto the document. That shape is left un-guessed; the first integrator defines it.
- **`name` is log-only.** The provider's `name` field is for observability and is never persisted onto a document in the current codebase.
