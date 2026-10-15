---
source: src/modules/invoicing/services/reencrypt.ts
sha256: fbc587c966d80ea6fc48da27fd4487a1a132c41c29b6b0e118f15f4dc57aa090
generated_at: 2026-10-15T10:39:44.527190+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/reencrypt.ts

## Purpose

Re-encrypts the buyer (`billingAddress`) PII stored on every invoice and credit note so that it is bound to the newest `NODE_PII_ENCRYPTION_KEY`. Serves as the invoicing-domain half of the global `reencrypt` ops script.

## Key elements

- **`partyFields`** (internal) – Maps the shared `PARTY_FIELDS` list to an `EncryptedField[]` for a single document, building each field's `piiBinding` with the document's own `_id` via `partyAad(kind, field, id)`.
- **`reencryptInvoices(dryRun?)`** (exported) – Fetches the current key ring, then calls `invoicingRepository.reencryptInvoices` and `reencryptCreditNotes` in parallel (filtered to docs that actually have a `billingAddress`). Merges the two collection reports with `mergeReports` and returns the combined result. `dryRun` is passed through so the caller can preview without writing.

## Relationships

- **`@infrastructure/security/reencrypt`** – Supplies the `mergeReports` helper and the `EncryptedField` contract this file produces for each field.
- **`@infrastructure/security/pii-encryption`** – Supplies `getPiiEncryptionKeyRing` (current key ring) and `piiBinding` (constructs the binding string used by the encryption layer).
- **`../model`** – Provides the `FrozenTaxDocument` type that `partyFields` reads `billingAddress` from.
- **`../pii`** – Provides `PARTY_FIELDS` (the canonical list of address sub-fields to re-encrypt), `partyAad` (AAD builder), and `InvoiceDocumentKind` (discriminates invoice vs. credit-note).
- **`../repository`** – Provides `invoicingRepository`, whose `reencryptInvoices` / `reencryptCreditNotes` methods perform the actual read-encrypt-write per collection.
- **`./index.ts`** – Barrel file that re-exports `reencryptInvoices` so consumers can `import { reencryptInvoices } from '../services'`.

## Notes

- `partyFields` is intentionally **not** exported; it is a closure-local helper consumed only by `reencryptInvoices`.
- The binding AAD includes the document's `_id`, so each encrypted value is cryptographically tied to *that specific document*—not just to the invoice/credit-note kind.
- `reencryptInvoices` filters with `{ billingAddress: { $exists: true } }`; documents without a stored address are skipped entirely.
- The function name says "invoices" but it actually covers **both** invoices and credit notes; the name is a legacy shorthand for "tax documents."
