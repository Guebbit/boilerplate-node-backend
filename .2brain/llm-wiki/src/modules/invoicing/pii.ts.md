---
source: src/modules/invoicing/pii.ts
source_sha256: 6cffec2bbbaecca12c38fd9dac67b8a0f8079fd07014725f190b72b20d192de6
context_sha256: 40acd4d39f0253144bacece436c85761c0aa8050861406ffef7c18c2ae5e99d4
generated_at: 2026-11-22T05:33:00.065365+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/pii.ts

## Purpose
Encrypts and decrypts the buyer's address (the "party") frozen on an invoice or credit note, so the stored copy is protected (GDPR Art. 32) while the document itself remains a whole legal copy. It is the invoicing twin of the orders module's codec and uses the same `NODE_PII_ENCRYPTION_KEY` ring.

## Key elements
- `InvoiceDocumentKind` — `'invoice' | 'credit-note'`; identifies the collection and is part of the AAD, so an invoice's address can't pose as a credit note's.
- `PARTY_FIELDS` — the fields processed: `fullName`, `street`, `city`, `zip`, `country`, `vatNumber`. Deliberately not the shared postal-address list: no phone is carried (data minimisation, GDPR Art. 5(1)(c)), and the VAT number is added.
- `partyAad(kind, field, documentId)` — builds the associated data string `invoicing:${kind}.billingAddress.${field}:${documentId}`.
- `mapParty` (internal) — applies a converter to every field of an `InvoiceParty`; `vatNumber` is optional, so if absent it stays absent (never the string `"undefined"`).
- `encryptInvoiceParty(party, kind, documentId)` — returns the party with each field encrypted via `encryptPii`, bound to the document's pre-allocated `_id`.
- `decryptInvoiceParty(party, kind, documentId)` — the inverse via `decryptPii`, passing `"<kind> <field>"` as a label.

## Relationships
- `src/infrastructure/security/pii-encryption.ts` — supplies `encryptPii` / `decryptPii`, which do the actual cryptography.
- `src/domain-primitives/postal-address.ts` — provides the `PostalAddressField` type that `PARTY_FIELDS` must satisfy (together with `'vatNumber'`).
- `src/modules/invoicing/model.ts` — provides the `InvoiceParty` type.
- Writers: `src/modules/invoicing/services/issue-invoice.ts` and `src/modules/invoicing/services/issue-credit-note.ts` encrypt the party under the new document's pre-allocated `_id`.
- Reader: `src/modules/invoicing/services/render.ts` is documented as the only place plaintext is needed.
- Other neighbors (`src/modules/invoicing/services/reencrypt.ts`, `src/modules/invoicing/services/correct-invoice.ts`, `src/modules/invoicing/services/retention.ts`, `src/modules/invoicing/repository.ts`, and the integration tests) are related in the graph, but this file does not state how they use it.

## Notes
- The AAD includes the document `_id`, so the `_id` must be allocated before insert, and ciphertext can't be moved between documents or kinds without failing decryption.
- Encryption and decryption must be given the same `kind` and `documentId`.
