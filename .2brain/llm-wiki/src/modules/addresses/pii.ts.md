---
source: src/modules/addresses/pii.ts
sha256: 760884823ab803183984ba731a1ed201b9e6f4dfbaffdd20e12389acb03d89c4
generated_at: 2026-10-15T10:18:38.730857+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/pii.ts

## Purpose

Wraps the low-level `encryptPii`/`decryptPii` primitives with address-entry-specific AAD binding so that each PII field (fullName, street, city, zip, country, phone) is cryptographically tied to the entry it belongs to. Provides whole-entry and single-field encrypt/decrypt helpers used by the repository layer on every write and read path.

## Key elements

- **`AddressPiiFields`** (type) — `Pick` of the six GDPR-relevant fields from `AddressItem`; used as the constraint for the generic helpers.
- **`addressAad(field, entryId)`** — builds the AAD string (`addressbooks:items.{field}:{entryId}`) that binds a ciphertext to a specific field *and* entry.
- **`encryptAddressItem<T>(item, entryId)`** — returns a new object with all PII fields encrypted and `_id` set to `entryId`. Generic so it accepts both a stored `AddressItem` and an incoming `AddressInput`. `phone` is encrypted only when present.
- **`encryptAddressField(field, plaintext, entryId)`** — encrypts a single field; intended for `updateEntry`, which re-encrypts only the fields a `PATCH` touched.
- **`decryptAddressItem(item)`** — decrypts all PII fields on a stored entry, using `item._id` as the AAD. `phone` is decrypted only when present.

## Relationships

- **`src/infrastructure/security/pii-encryption.ts`** — provides `encryptPii` and `decryptPii`, the underlying AEAD calls this module delegates to.
- **`src/modules/addresses/model.ts`** — source of the `AddressItem` type used in `AddressPiiFields` and as the return type of `decryptAddressItem`.
- **`src/modules/addresses/repository.ts`** — the sole caller of `encryptAddressItem` (on `create`/`addEntry`) and `decryptAddressItem` (on all read paths). For `updateEntry` it calls `encryptAddressField` inline per changed field.
- **`src/modules/addresses/reencrypt.ts`** — graph neighbor in the same module; expected to reuse these helpers when bulk re-encrypting entries (e.g. key rotation).
- **`tests/integration/scenarios/shop.test.ts`** — integration test that exercises the encrypt→store→decrypt round-trip through the address repository.

## Notes

- **AAD is per-field *and* per-entry.** Copying a ciphertext to another field or another entry will fail the AEAD auth tag. The `entryId` therefore must be the one under which the entry was originally encrypted.
- **`entryId` is assigned before encryption** (it feeds the AAD). `encryptAddressItem` sets `_id` in the same object spread, but callers must ensure the `_id` value is already known.
- **`phone` is optional.** Both encrypt and decrypt helpers conditionally spread it; an entry without a phone simply omits the key.
- **`updateEntry` deliberately does NOT use `encryptAddressItem`.** It needs per-field granularity so unchanged fields keep their existing ciphertext; the repository inlines one `if`-per-field call to `encryptAddressField`.
- **`decryptAddressItem` uses a non-null assertion (`item._id!`)** — safe because the Mongoose schema declares `_id: true` on the subdocument, but would throw if called with a plain object lacking `_id`.
