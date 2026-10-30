---
source: src/modules/invoicing/providers/index.ts
sha256: 23ed9bdf090ef020fad518671a1f6cbb76010cfa3b791c4abf9a6f7a74cf2556
generated_at: 2026-10-29T04:12:41.213716+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/providers/index.ts

## Purpose

Defines the **e-invoicing provider port** — the single interface that any national e-invoicing network (SdI, Peppol, etc.) plugs into. It ships one built-in implementation (`pdf`) and exposes a registry + resolver so a deployment can swap implementations via `NODE_EINVOICING_PROVIDER` without touching call sites. The design mirrors `payments/providers`: one interface, one adapter per file, one registry entry.

## Key elements

- **`EInvoicingDocumentKind`** — union type `'invoice' | 'creditNote'`; determines title/disclaimer rendering.
- **`EInvoicingDocument`** — the input shape passed to a provider: `FrozenTaxDocument` fields (minus `orderId`) plus `kind` and an optional `reversalOf` (credit-note back-reference). Intentionally excludes the Mongoose document.
- **`EInvoicingProvider`** — the interface every implementation must satisfy: a `name` string and an `issue(document): Promise<Buffer>` method.
- **`registry`** (internal) — `createProviderRegistry` instance; currently maps `pdf` → `pdfEInvoicingProvider`.
- **`resolveEInvoicingProvider()`** — reads `NODE_EINVOICING_PROVIDER` from `invoicingConfig()` on every call (not memoised) and returns the matching provider, or throws.
- **`invoicingProviderProbe`** — boot-time probe (via `defineProbe`) that fails fast on a misspelled env value before the first invoice is issued.

## Relationships

- **`./pdf`** — the sole adapter registered in this build; its `pdfEInvoicingProvider` is the value bound to the `pdf` key.
- **`@infrastructure/runtime/provider-registry`** — supplies `createProviderRegistry` and `requireProvider`, the generic mechanism shared with the payments module.
- **`@infrastructure/config/define`** — supplies `defineProbe` used to create the boot-time validation probe.
- **`../config`** — `invoicingConfig()` is the source of the `NODE_EINVOICING_PROVIDER` env value at resolution time.
- **`../model`** — contributes the `FrozenTaxDocument` type that `EInvoicingDocument` is derived from.
- **`../module.ts`** — consumes `invoicingProviderProbe` during module boot to validate configuration early.
- **`../services/render.ts`** — downstream consumer that calls `resolveEInvoicingProvider().issue(…)` to produce the PDF bytes for a document.

## Notes

- **No SdI/Peppol adapter is shipped.** The interface is deliberately minimal (`issue → Buffer`); a real network adapter would additionally need to report a transmission outcome (delivery id, rejection reason) back onto the document. That extension is left to whoever builds the first such adapter.
- **Provider is resolved per call, not memoised** — same rationale as `payments/providers#resolvePaymentProvider`; keeps behavior correct if the env value changes at runtime (e.g., in tests).
- **The probe is a shape-less slice** (`defineProbe` name + function) to avoid a circular import: the resolver imports `../config`, so `../config` must not import the resolver.
- **`EInvoicingDocument` omits `orderId`** from `FrozenTaxDocument`; a provider must never reach the database — it receives only frozen fields.
