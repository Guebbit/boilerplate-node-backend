---
source: src/modules/invoicing/services/reencrypt.ts
source_sha256: fbc587c966d80ea6fc48da27fd4487a1a132c41c29b6b0e118f15f4dc57aa090
context_sha256: d2840882d5d2c8bd763a1eafe069b362442d2784da660c60068cd396e5cca073
generated_at: 2026-11-22T05:36:25.467308+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/services/reencrypt.ts

## Purpose
Moves the buyer address (`billingAddress`) frozen on every invoice and credit note onto the newest `NODE_PII_ENCRYPTION_KEY`. It is the invoicing-side implementation behind the ops script `reencrypt`; the generic re-encryption machinery lives in `@infrastructure/security/reencrypt`.

## Key elements
- `partyFields(kind, document)` (internal): builds the list of `EncryptedField` entries for one document. For each name in `PARTY_FIELDS` that is present on `document.billingAddress`, it emits:
  - `path`: `billingAddress.<field>`
  - `stored`: the currently stored value
  - `binding`: `piiBinding(partyAad(kind, field, String(document._id)))`, tying the ciphertext to the document's own `_id`
  - `label`: `<kind>.billingAddress.<field>`

  Fields that are `undefined` are skipped.
- `reencryptInvoices(dryRun = false)` (exported): fetches the key ring via `getPiiEncryptionKeyRing()`, then re-encrypts invoices and credit notes concurrently (`Promise.all`) through the invoicing repository. It returns the two reports combined with `mergeReports`. With `dryRun`, it only counts what a real run would move and writes nothing.

## Relationships
- `src/infrastructure/security/reencrypt.ts`: supplies `mergeReports` and the `EncryptedField` type.
- `src/infrastructure/security/pii-encryption.ts`: supplies `getPiiEncryptionKeyRing` and `piiBinding`.
- `src/modules/invoicing/pii.ts`: supplies `PARTY_FIELDS`, `partyAad` and the `InvoiceDocumentKind` type, which define which fields are encrypted and how the AAD is built.
- `src/modules/invoicing/repository.ts`: exports `invoicingRepository`, whose `reencryptInvoices` and `reencryptCreditNotes` methods do the actual processing. This file passes each a `{ filter, ring, fieldsOf }` options object and the `dryRun` flag.
- `src/modules/invoicing/model.ts`: provides the `FrozenTaxDocument` type used for the documents.
- `src/modules/invoicing/services/index.ts` and `src/modules/tasks/tests/integration/idempotent-note.test.ts` are listed as graph neighbors. Nothing in this file shows how they interact with it.

## Notes
- Both collections use the same filter, `{ billingAddress: { $exists: true } }`, so documents with no `billingAddress` are not selected.
- The kinds used are `'invoice'` and `'credit-note'`. The kind is part of the AAD and of the label, so the two document types bind their ciphertexts differently.
- Because the AAD includes `document._id`, a stored value is bound to its own document.
