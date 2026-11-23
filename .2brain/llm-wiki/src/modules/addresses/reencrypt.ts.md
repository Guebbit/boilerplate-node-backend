---
source: src/modules/addresses/reencrypt.ts
source_sha256: 674e8e5db1038e75466d4651be497424fb0e70d292cedd4b8f7fb698455fc14a
context_sha256: f4e064d797401b8ee9900e4966a20b6ccbc96257af3f7d4389bce30fcbb4d702
generated_at: 2026-11-22T04:15:00.938521+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/reencrypt.ts

## Purpose
Moves every address-book entry's encrypted PII fields onto the newest `NODE_PII_ENCRYPTION_KEY`. It is the address-module side of the `reencrypt` ops script, supplying the module-specific knowledge of which fields are encrypted and how each is bound, while the generic re-encryption logic lives in `@infrastructure/security/reencrypt`.

## Key elements
- `fieldsOf(book)` (internal): for an `AddressBookDocument`, walks `book.items` and each field in `ADDRESS_PII_FIELDS`. Fields that are `undefined` are skipped. Each present field becomes an `EncryptedField` with:
  - `path`: `items.<index>.<field>`, the location to write it back to
  - `stored`: the current stored value
  - `binding`: `piiBinding(addressAad(field, entry._id!))`
  - `label`: `addressbooks.items.<field>`
- `reencryptAddressBooks(dryRun = false)` (exported): calls `addressBookRepository.reencrypt({ ring: getPiiEncryptionKeyRing(), fieldsOf }, dryRun)`. With `dryRun`, it counts what a real run would move and writes nothing.

## Relationships
- `src/infrastructure/security/reencrypt.ts`: provides the `EncryptedField` type that `fieldsOf` returns.
- `src/infrastructure/security/pii-encryption.ts`: provides `getPiiEncryptionKeyRing()` (the key ring) and `piiBinding()` (wraps the AAD into a binding).
- `src/modules/addresses/pii.ts`: provides `ADDRESS_PII_FIELDS` (the encrypted field names) and `addressAad(field, id)` (the per-entry AAD).
- `src/modules/addresses/repository.ts`: provides `addressBookRepository`, to which the ring and `fieldsOf` are passed along with `dryRun`.
- `src/modules/addresses/model.ts`: provides the `AddressBookDocument` type.

## Notes
- Each field's binding is derived from the field name and the entry's `_id`, so the `_id` is part of what the ciphertext is bound to. `fieldsOf` uses a non-null assertion (`entry._id!`) and assumes every item has an `_id`.
- This file only describes the fields. Reading, decrypting, re-encrypting and writing are delegated to the repository.
