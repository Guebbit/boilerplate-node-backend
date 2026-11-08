---
source: src/modules/addresses/pii.ts
sha256: 76881d3b759e1edf19d095163d8a87a53a287dafcc9eae659edd1ef42b1eaf74
generated_at: 2026-11-08T04:55:40.199111+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/pii.ts

## Purpose

Encrypts and decrypts the PII fields on a single address-book entry — the postal-address fields GDPR specifically names. It is the one module that bridges the address domain model with the AEAD encryption infrastructure, providing the shared encrypt/decrypt operations that both the repository (writes) and every reader path (service wire-mapping, checkout snapshot) rely on.

## Key elements

- **`ADDRESS_PII_FIELDS`** — The authoritative list of PII fields (sourced from `POSTAL_ADDRESS_FIELDS`). A compile-time conditional type turns it into `never` if any `AddressItem` key is missing from the list, so a new plaintext field cannot be stored by accident.
- **`REQUIRED_PII_FIELDS`** — Subset of the above, excluding the optional `phone` field. Documents which fields every entry must carry.
- **`addressAad(field, entryId)`** — Builds the AEAD associated-data string (`addressbooks:items.<field>:<entryId>`), binding each ciphertext to a specific field *and* a specific entry.
- **`encryptAddressItem<T>(item, entryId)`** — Returns a new object with every present PII field encrypted and `_id` set. Generic so it accepts both a stored `AddressItem` and an incoming `CreateAddressRequest`.
- **`encryptAddressField(field, plaintext, entryId)`** — Single-field encrypt, used by `updateEntry` to re-encrypt only the fields a `PATCH` actually changed.
- **`decryptAddressItem(item)`** — Returns a new `AddressItem` with PII fields decrypted. Uses the entry's `_id` as the AAD key.
- **`mapPiiFields`** *(internal)* — Applies a `transform` to every *present* PII field; absent `phone` stays absent.

## Relationships

- **`src/domain-primitives/postal-address.ts`** — Supplies `POSTAL_ADDRESS_FIELDS` and the `PostalAddressField` union type. This file derives `ADDRESS_PII_FIELDS` from that list and uses the type to enforce completeness.
- **`src/infrastructure/security/pii-encryption.ts`** — Provides the `encryptPii` / `decryptPii` AEAD primitives that every public function here delegates to.
- **`src/modules/addresses/model.ts`** — Source of the `AddressItem` type. The conditional type on `ADDRESS_PII_FIELDS` checks against `keyof AddressItem`, making the two files co-compile only when in sync.
- **`src/modules/addresses/repository.ts`** — The sole caller of `encryptAddressItem` (create / addEntry) and `decryptAddressItem` (all read paths). Also calls `encryptAddressField` inline within `updateEntry`.
- **`src/modules/addresses/reencrypt.ts`** — Walks the same `ADDRESS_PII_FIELDS` list to re-encrypt existing entries (e.g., key rotation).
- **`tests/integration/scenarios/shop.test.ts`** — End-to-end scenario that exercises the full encrypt → persist → decrypt cycle through the repository and service layers.

## Notes

- **Compile-time completeness guard.** If a field is added to `AddressItem` but *not* to `POSTAL_ADDRESS_FIELDS`, `ADDRESS_PII_FIELDS` resolves to `never` and the project fails to build. The reverse (field in the primitive but not the model) is silently allowed. Keep the two in lockstep.
- **`phone` is the only optional PII field.** It appears in `ADDRESS_PII_FIELDS` (so it is encrypted/decrypted when present) but is excluded from `REQUIRED_PII_FIELDS`. `mapPiiFields` skips it when `undefined`.
- **AAD binding is strict.** A ciphertext copied to a different field *or* a different entry will fail its auth tag on decryption. Do not share ciphertexts across entries.
- **`entryId` must exist before encrypting.** `encryptAddressItem` takes it as a parameter and bakes it into the AAD; the repository must assign `_id` first.
- **`decryptAddressItem` uses a non-null assertion on `_id`.** Safe because the Mongoose schema sets `_id: true`, but callers must not pass a partially-constructed object.
- **`updateEntry` does not call `encryptAddressItem`.** It encrypts only the fields the `PATCH` touched, one `if` per field, inline in `repository.ts`, calling `encryptAddressField` each time.
