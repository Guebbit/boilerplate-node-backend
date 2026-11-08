---
source: src/modules/invoicing/services/reencrypt.ts
sha256: fbc587c966d80ea6fc48da27fd4487a1a132c41c29b6b0e118f15f4dc57aa090
generated_at: 2026-11-08T06:15:30.683859+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/reencrypt.ts

## Purpose
Domain-level orchestrator that re-encrypts the buyer address (`billingAddress`) on all invoices and credit notes onto the newest PII encryption key. It translates invoicing-specific concerns (which fields, which AAD binding, which collections) into calls on the generic infrastructure re-encryption utilities.

## Key elements

- **`partyFields`** (module-private) – Takes a document kind (`'invoice'` | `'credit-note'`) and a `FrozenTaxDocument`, returns `EncryptedField[]` for every `billingAddress` sub-field that is present. Each entry carries a PII binding computed via `piiBinding(partyAad(kind, field, document._id))`, tying the ciphertext to that specific document.
- **`reencryptInvoices(dryRun?)`** (exported) – Runs the re-encryption for both invoices and credit notes concurrently (`Promise.all`). Passes a `billingAddress: { $exists: true }` filter, the live key ring, and the `partyFields` mapper to the repository. Returns a single merged report. `dryRun` (default `false`) counts affected rows without writing.

## Relationships

- **`@infrastructure/security/reencrypt`** – Supplies `mergeReports` and the `EncryptedField` shape used to describe each field to be rotated.
- **`@infrastructure/security/pii-encryption`** – Supplies `getPiiEncryptionKeyRing()` (current key ring) and `piiBinding()` (per-document AAD binding).
- **`../model`** – Provides the `FrozenTaxDocument` type that shapes the `billingAddress` access.
- **`../pii`** – Provides `PARTY_FIELDS` (the list of address sub-fields), `partyAad` (AAD construction), and the `InvoiceDocumentKind` union.
- **`../repository`** – `invoicingRepository.reencryptInvoices` / `.reencryptCreditNotes` perform the actual per-collection read-mutate-write.
- **`services/index.ts`** – Re-exports `reencryptInvoices` so callers can import from the services barrel.

## Notes

- Encryption AAD is scoped to `(kind, field, document._id)`; the same address value stored on two different invoices produces different bindings and therefore different ciphertexts.
- Documents lacking a `billingAddress` are skipped entirely (the `$exists` filter), so `partyFields` never sees a `null` object in practice.
- The two collections are re-encrypted independently; a failure on one does not roll back the other, but the merged report will surface both outcomes.
