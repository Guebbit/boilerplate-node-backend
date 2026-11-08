---
source: src/modules/invoicing/pii.ts
sha256: 787915798285ecc81199fc3306bcf7cf63f1dfc0ec7816fe7bae98ecd31dd23c
generated_at: 2026-11-08T06:12:34.195677+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/pii.ts

## Purpose
Field-level PII codec for the buyer's billing address on invoices and credit notes. It encrypts the five address strings before they are persisted and decrypts them on the one read path that needs plaintext, using the shared `NODE_PII_ENCRYPTION_KEY` ring. The document itself is kept whole as the legal copy; only its storage representation is protected (GDPR Art. 32).

## Key elements
- **`InvoiceDocumentKind`** — `'invoice' | 'credit-note'`; part of the AAD so an invoice's ciphertext cannot be replayed against a credit note.
- **`PARTY_FIELDS`** — const tuple `['fullName','street','city','zip','country']`; satisfies `readonly PostalAddressField[]`. Deliberately omits phone (data minimisation, GDPR Art. 5(1)(c)).
- **`partyAad(kind, field, documentId)`** — builds the per-field AAD string: `invoicing:<kind>.billingAddress.<field>:<documentId>`.
- **`encryptInvoiceParty(party, kind, documentId)`** — maps every field through `encryptPii` with the document-bound AAD; returns the ciphertext-shaped `InvoiceParty`.
- **`decryptInvoiceParty(party, kind, documentId)`** — inverse; passes a human-readable label (`"invoice fullName"`) as the decrypt error context.
- **`mapParty`** (private) — generic field-walk helper; both directions funnel through it.

## Relationships
- **`src/infrastructure/security/pii-encryption.ts`** — source of `encryptPii` / `decryptPii`; the shared key-ring primitive.
- **`src/domain-primitives/postal-address.ts`** — supplies the `PostalAddressField` type that `PARTY_FIELDS` is checked against.
- **`src/modules/invoicing/model.ts`** — supplies the `InvoiceParty` type used as the in/out shape of every function here.
- **`src/modules/invoicing/services/issue-invoice.ts`** — calls `encryptInvoiceParty` before inserting a new invoice.
- **`src/modules/invoicing/services/issue-credit-note.ts`** — same write-path usage for credit notes.
- **`src/modules/invoicing/services/render.ts`** — the sole read path; calls `decryptInvoiceParty` to obtain plaintext for output.
- **`src/modules/invoicing/services/reencrypt.ts`** — round-trips through both directions (decrypt then re-encrypt) when rotating the key.
- **`src/modules/invoicing/tests/integration/issue-invoice.test.ts`, `issue-credit-note.test.ts`, `reencrypt.test.ts`** — integration tests that exercise the encrypt→store→decrypt cycle end-to-end.

## Notes
- `documentId` is the pre-allocated `_id` of the target document, passed *before* the insert. This means the AAD is stable from creation time; a re-insert under a new `_id` would make the ciphertext undecryptable.
- The AAD binds **kind + field + documentId**, so swapping the `kind` argument at decrypt time will fail authentication rather than silently decrypting the wrong document.
- Only `render.ts` ever calls `decryptInvoiceParty`; no other service should pull plaintext. Treat any new decryption call as a GDPR Art. 32 concern.
