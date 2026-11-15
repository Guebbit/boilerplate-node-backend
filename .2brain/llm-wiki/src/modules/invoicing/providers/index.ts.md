---
source: src/modules/invoicing/providers/index.ts
sha256: e991d5e5f0311a4df1b9ca84d0954d256dcba536c1704867635abcc38733eea4
generated_at: 2026-11-14T20:12:25.841588+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/providers/index.ts

## Purpose

Defines the e-invoicing provider port: the interface, the document type it operates on, and the provider registry that maps a deployment-configured name (`NODE_EINVOICING_PROVIDER`) to a concrete implementation. It mirrors the `payments/providers` pattern — one interface, one shipped adapter (`pdf`), and a registry a new adapter can join with a single entry.

## Key elements

- **`EInvoicingDocumentKind`** — `'invoice' | 'creditNote'`; distinguishes the two document titles a provider must render.
- **`EInvoicingDocument`** — The input shape a provider receives. Omits `orderId` from `FrozenTaxDocument`, adds `kind`, and optionally `reversalOf` (the invoice number a credit note reverses). Deliberately never the Mongoose document.
- **`EInvoicingProvider`** — The interface every adapter implements. Requires a `name` string and a pure `render(document): Promise<Buffer>` that returns PDF bytes. Explicitly must not transmit to an authority.
- **`registry`** (module-private) — A `createProviderRegistry<EInvoicingProvider>` currently holding only `pdf: pdfEInvoicingProvider`. Adding a provider = one new adapter file + one entry here.
- **`resolveEInvoicingProvider()`** — Resolves the active provider from `NODE_EINVOICING_PROVIDER` (default `pdf`) via `requireProvider`. Not memoised; reads config fresh each call. Throws if the name is unknown to the build.
- **`invoicingProviderProbe`** — A `defineProbe` boot-time check that calls `resolveEInvoicingProvider`, surfacing a typo in the env variable at startup rather than at first invoice.

## Relationships

- **`src/infrastructure/runtime/provider-registry.ts`** — Provides `createProviderRegistry` and `requireProvider`, the two primitives this file uses to build and query the registry.
- **`src/infrastructure/config/define.ts`** — Provides `defineProbe`, used to register `invoicingProviderProbe` as a shape-less boot probe.
- **`src/modules/invoicing/config.ts`** — Supplies `invoicingConfig()` which exposes `NODE_EINVOICING_PROVIDER`; consumed inside `resolveEInvoicingProvider`.
- **`src/modules/invoicing/providers/pdf.ts`** — Provides `pdfEInvoicingProvider`, the sole implementation registered in the registry.
- **`src/modules/invoicing/model.ts`** — Exports `FrozenTaxDocument`, the base type from which `EInvoicingDocument` is derived (via `Omit<FrozenTaxDocument, 'orderId'>`).

## Notes

- The port is render-only. Transmitting to a national authority (SdI, Peppol, etc.) is a separate one-time step in `services/issue-invoice.ts` / `issue-credit-note.ts`, not part of `EInvoicingProvider.render`.
- `invoicingProviderProbe` is intentionally a "shape-less slice" (a zero-arg function) because `config` imports `define` and this file imports `config`; a typed probe would create a circular dependency.
- `render` is expected to be idempotent and safe to repeat on every download that finds no stored copy — do not add side effects or network calls there.
- The module docblock explicitly scopes out Italy's SdI and the EU's Peppol: they are not built here; the first adapter to need transmission will design that step.
