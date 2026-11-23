---
source: src/modules/invoicing/providers/index.ts
source_sha256: be55cd1cae173f65d02e7074164648449e5fe24e97135fa1f7c5578df0d7b594
context_sha256: b9b6c5a8798de9f3a7d914951ce90f3e2f030b1c81b70c86f054e4d510fb6b1c
generated_at: 2026-11-22T05:33:19.623472+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/providers/index.ts

## Purpose
Defines the e-invoicing port: the interface a national e-invoicing network plugs into, plus the registry that picks the active implementation. The choice is a deployment setting (`NODE_EINVOICING_PROVIDER`), not a code path. It is modeled on `payments/providers`. Only one implementation ships, `pdf`. Italy's SdI and the EU's Peppol are explicitly not built. The port renders only the buyer's copy. Transmitting to an authority is a separate step at issue time, in `src/modules/invoicing/services/issue-invoice.ts` and `issue-credit-note.ts`.

## Key elements
- `EInvoicingDocumentKind`: `'invoice' | 'creditNote'`. Each kind prints under its own title and disclaimer.
- `EInvoicingDocument`: `FrozenTaxDocument` from `model.ts` without `orderId`, plus `kind` and an optional `reversalOf` (`{ number, reason }`) that only credit notes carry. It is a plain data shape, never the Mongoose document, so a provider cannot reach the database.
- `EInvoicingProvider`: the interface an implementation must satisfy.
  - `name`: used for logs and not persisted.
  - `render(document)`: returns `Promise<Buffer>` holding the PDF bytes. It must be a pure, repeatable render and must never transmit.
- `registry` (module-private): built with `createProviderRegistry`, currently `{ pdf: pdfEInvoicingProvider }`.
- `resolveEInvoicingProvider()`: looks up the provider named by `invoicingConfig().NODE_EINVOICING_PROVIDER` via `requireProvider`. It throws if the name is unknown.
- `invoicingProviderProbe`: a boot probe created with `defineProbe('invoicing-provider', resolveEInvoicingProvider)`.

## Relationships
- `src/infrastructure/runtime/provider-registry.ts`: supplies `createProviderRegistry` and `requireProvider`.
- `src/infrastructure/config/define.ts`: supplies `defineProbe`.
- `src/modules/invoicing/config.ts`: supplies `invoicingConfig()`, which holds the `NODE_EINVOICING_PROVIDER` value (default `pdf`).
- `src/modules/invoicing/model.ts`: supplies the `FrozenTaxDocument` and `CreditNoteReason` types.
- `src/modules/invoicing/providers/pdf.ts`: the only registered implementation, `pdfEInvoicingProvider`. It is covered by `src/modules/invoicing/tests/unit/pdf-provider.test.ts`.
- `src/modules/invoicing/services/render.ts`, `src/modules/invoicing/emails.ts` and `src/modules/invoicing/module.ts` are graph neighbors. The file's content does not show how they use this module.

## Notes
- The provider is resolved on every call and not memoised. The reasoning is the same as `payments/providers#resolvePaymentProvider`.
- The probe exists so a typo in `NODE_EINVOICING_PROVIDER` fails at boot rather than on the first invoice. It is a "shape-less slice": the resolver imports the config, so the config cannot import the resolver.
- To add a provider, write one adapter file and add one entry to `registry`.
