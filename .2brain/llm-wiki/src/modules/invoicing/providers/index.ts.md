---
source: src/modules/invoicing/providers/index.ts
sha256: 23ed9bdf090ef020fad518671a1f6cbb76010cfa3b791c4abf9a6f7a74cf2556
generated_at: 2026-11-08T06:12:58.073734+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/providers/index.ts

## Purpose

Defines the e-invoicing provider port: the interface a national e-invoicing network plugs into. It mirrors the `payments/providers` pattern—one contract, one shipped implementation (`pdf`), and a registry that a deployment configures via `NODE_EINVOICING_PROVIDER`. The file exists so that adding a real SdI/Peppol adapter later is "one file plus one line here" without touching call-sites.

## Key elements

- **`EInvoicingDocumentKind`** — union `'invoice' | 'creditNote'`; determines print title/disclaimer.
- **`EInvoicingDocument`** — the payload a provider receives: the frozen fields from `FrozenTaxDocument` (minus `orderId`) plus `kind` and an optional `reversalOf` for credit notes. Deliberately *not* the Mongoose document.
- **`EInvoicingProvider`** — the interface every adapter implements: a `name` string and `issue(document) → Promise<Buffer>`.
- **`registry`** (module-private) — a `ProviderRegistry<EInvoicingProvider>` seeded with `{ pdf: pdfEInvoicingProvider }`.
- **`resolveEInvoicingProvider()`** — reads `NODE_EINVOICING_PROVIDER` (via `invoicingConfig()`) and returns the matching provider, or throws on an unknown name. Called fresh per invocation, not memoised.
- **`invoicingProviderProbe`** — a `defineProbe` that calls the resolver at boot so a typo in the env var fails at startup rather than on the first invoice.

## Relationships

- **`src/infrastructure/runtime/provider-registry.ts`** — supplies `createProviderRegistry` (to build the local `registry`) and `requireProvider` (used inside `resolveEInvoicingProvider` to look up by env-var name).
- **`src/infrastructure/config/define.ts`** — supplies `defineProbe`, which wraps `resolveEInvoicingProvider` into the boot-time `invoicingProviderProbe`.
- **`src/modules/invoicing/config.ts`** — `invoicingConfig()` is called inside the resolver to read the `NODE_EINVOICING_PROVIDER` value (default `'pdf'`).
- **`src/modules/invoicing/model.ts`** — provides the `FrozenTaxDocument` type that `EInvoicingDocument` extends via `Omit`.
- **`src/modules/invoicing/providers/pdf.ts`** — the single shipped `EInvoicingProvider` implementation, registered as `pdf`.

## Notes

- The resolver reads config **per call** (no memoisation), matching the pattern in `payments/providers`; this means the env var can theoretically change at runtime, though in practice it is set at process start.
- The probe is shape-less (no return-type annotation on the `defineProbe` call) to avoid a circular import: the resolver imports `invoicingConfig`, so `config` must not import the resolver.
- `EInvoicingDocument` intentionally excludes `orderId` and the Mongoose document to enforce that a provider cannot reach the database.
- The docblock explicitly states that SdI/Peppol are *not* implemented here; their "transmit + receive outcome" shape is left to the first adapter author.
