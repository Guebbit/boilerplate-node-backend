---
source: src/modules/addresses/pii.ts
source_sha256: 76881d3b759e1edf19d095163d8a87a53a287dafcc9eae659edd1ef42b1eaf74
context_sha256: c726b9ea88ca7d76b3b03b9787a652edd29546648b6ca156f3d062b19956112e
generated_at: 2026-11-22T04:14:39.412077+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/pii.ts

## Purpose
Encrypts and decrypts the PII fields of a single address-book entry (the shared postal-address fields). It centralises the field list and the per-field associated data (AAD) so that every read and write path in the addresses module handles PII the same way and no field is accidentally stored in plaintext.

## Key elements
- `REQUIRED_PII_FIELDS` — `fullName`, `street`, `city`, `zip`, `country`, in reporting order. Everything in the shared postal-address list except the optional `phone`.
- `ADDRESS_PII_FIELDS` — the full PII field list, taken from `POSTAL_ADDRESS_FIELDS`. A conditional type narrows it against `AddressItem`'s keys (excluding `_id`, `label`, `default`). If the entry gains a field that is missing from the shared primitive, the type becomes `never` and compilation fails.
- `addressAad(field, entryId)` — builds the AAD string `addressbooks:items.<field>:<entryId>`. This ties a ciphertext to one field of one entry, so copying it elsewhere fails the auth tag.
- `encryptAddressItem(item, entryId)` — returns a new object with every present PII field encrypted and `_id` set to `entryId`. It is generic, so it accepts both a stored `AddressItem` and an incoming `CreateAddressRequest`.
- `encryptAddressField(field, plaintext, entryId)` — encrypts a single field. It is used by `updateEntry` for the fields a `PATCH` changed.
- `decryptAddressItem(item)` — returns a new object with every present PII field decrypted. It uses `item._id` for the AAD and labels errors as `address <field>`.
- `mapPiiFields` (internal) — applies a transform to each PII field the item holds. An absent `phone` stays absent.

## Relationships
- `src/infrastructure/security/pii-encryption.ts` — supplies `encryptPii` and `decryptPii`, which do the actual cryptography. This file only decides which fields to run through them and what AAD to use.
- `src/domain-primitives/postal-address.ts` — supplies `POSTAL_ADDRESS_FIELDS` and the `PostalAddressField` type, the source of truth for the field list.
- `src/modules/addresses/model.ts` — supplies the `AddressItem` type that the field list is checked against.
- `src/modules/addresses/repository.ts` — the sole caller. It uses `encryptAddressItem` for `create`'s seed path and `addEntry`, and `decryptAddressItem` for all reads. `updateEntry` encrypts field by field inline in the repository.
- `src/modules/addresses/reencrypt.ts` — per the field-list doc comment, it walks `ADDRESS_PII_FIELDS` as well.
- `tests/integration/scenarios/shop.test.ts` — an integration test neighbor in the graph. Nothing in this file shows how it uses the module.

## Notes
- The entry's `_id` is part of the AAD, so it must be assigned before encrypting, and decryption only works with the same `_id`.
- `decryptAddressItem` uses a non-null assertion on `_id`, because the schema defines `{ _id: true }`.
- `updateEntry` deliberately does not use the whole-item helpers. It encrypts only changed fields, using `encryptAddressField`'s AAD scheme.
