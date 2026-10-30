---
source: src/modules/addresses/pii.ts
sha256: 06b83667ab4facf27fae7f7990bc06e782a620fd43804d1de6dc6016166de537
generated_at: 2026-10-29T03:08:52.650796+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/pii.ts

## Purpose

Encapsulates encryption and decryption of the six PII fields (fullName, street, city, zip, country, phone) on a single address-book entry, binding each ciphertext to a specific field and entry ID via an AAD string. Centralising the field list and the AAD construction ensures no caller can accidentally store or read a field in plaintext by omitting it.

## Key elements

- **`REQUIRED_PII_FIELDS`** – The five mandatory PII fields in reporting order (fullName, street, city, zip, country).
- **`ADDRESS_PII_FIELDS`** – All six PII fields (the five required + optional `phone`). Single source of truth that encrypt, decrypt, update, and re-encrypt all iterate over.
- **`addressAad(field, entryId)`** – Builds the AAD string (`addressbooks:items.<field>:<entryId>`) that ties a ciphertext to one field of one entry. A mismatch in field or entry fails the auth tag on decryption.
- **`encryptAddressItem(item, entryId)`** – Returns a new object with every present PII field encrypted and `_id` set. Generic over `T extends AddressPiiFields` so it accepts both a stored `AddressItem` and an incoming `AddressInput`.
- **`encryptAddressField(field, plaintext, entryId)`** – Encrypts a single field in isolation; used by `updateEntry` for PATCH-style partial writes.
- **`decryptAddressItem(item)`** – Returns a new object with every PII field decrypted, using the entry's own `_id` for the AAD.
- **`mapPiiFields`** (internal) – Generic helper that maps a transform over every present PII field, skipping absent ones (e.g. `phone`).

## Relationships

- **`src/infrastructure/security/pii-encryption.ts`** – Provides the `encryptPii` / `decryptPii` primitives this file wraps with address-specific AAD.
- **`src/modules/addresses/model.ts`** – Supplies the `AddressItem` type that defines the PII field names and the `_id` used for AAD.
- **`src/modules/addresses/repository.ts`** – The sole caller of `encryptAddressItem` (create/addEntry), `decryptAddressItem` (all reads), and `encryptAddressField` (updateEntry's per-field path). `updateEntry` intentionally stays inline rather than reusing the full-item helpers.
- **`src/modules/addresses/reencrypt.ts`** – Walks the same `ADDRESS_PII_FIELDS` list to re-encrypt entries under a new key, consuming the shared field-order constant.
- **`tests/integration/scenarios/shop.test.ts`** – Integration test that exercises the encrypt/decrypt round-trip end-to-end through the service and repository layers.

## Notes

- **AAD is field- and entry-scoped.** Swapping a ciphertext between fields or between entries causes an auth-tag failure, not a silent plaintext leak. When calling `encryptAddressItem` or `encryptAddressField`, the `entryId` passed must be the entry's final `_id` (assigned before encryption), because it is baked into the AAD.
- **`phone` is optional.** Every helper skips it when absent; callers must not assume it exists on a decrypted entry.
- **`updateEntry` does not use these helpers.** It encrypts only the PATCH-changed fields inline in `repository.ts` with one `if` per field, calling `encryptAddressField` directly. Don't expect to find a full-item encrypt/decrypt call on the update path.
- **Generic `T` constraint.** `encryptAddressItem` and `mapPiiFields` are generic so they accept both `AddressItem` (stored doc with `_id`) and the contract's `AddressInput` (incoming write without `_id`), returning the widened type.
