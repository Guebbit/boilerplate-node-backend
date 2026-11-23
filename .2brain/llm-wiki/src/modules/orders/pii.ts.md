---
source: src/modules/orders/pii.ts
source_sha256: 3d850960049d5f8363b87e6d1259a32855289962c6e23e5ebe39b77297dc6717
context_sha256: 743594543201ff74325e45ef127b561e921576cc37e030f062a4e3172cd9fcc2
generated_at: 2026-11-22T06:16:44.442595+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/pii.ts

## Purpose
Field-level encryption codec for the personal text an order freezes: the embedded shipping/billing addresses and the buyer's notes. It is the order-side twin of `src/modules/addresses/pii.ts` and uses the same `NODE_PII_ENCRYPTION_KEY` ring. The codec is explicit (not mongoose getters/setters), so `toJSON` never ships ciphertext, foreign subdocuments aren't double-encrypted, and query filters aren't rewritten.

## Key elements
- `OrderAddressField` / `OrderAddressPath` — types for the encrypted address fields (postal fields plus `vatNumber`) and the two paths (`'shippingAddress' | 'billingAddress'`).
- `ADDRESS_PATHS` — the two address paths walked on every order.
- `addressFieldsOf(path)` — fields to encrypt for a path; the billing address adds `vatNumber`.
- `addressAad`, `notesAad`, `timelineNoteAad` — build the associated-data strings (`orders:<what>:<orderId>`) binding ciphertext to one order.
- `encryptOrderPii(data, orderId)` — returns a copy of the order data with present address fields and `notes` encrypted.
- `decryptOrderAddress(address, path, orderId)` — decrypts one stored address, for readers holding the ciphertext row (invoice issuers).
- `decryptSerializedOrder(serialized)` — decrypts a serialized order in place, using `serialized.id` as the AAD.
- `ORDER_ADDRESS_PII_FIELDS` (private) — `POSTAL_ADDRESS_FIELDS` with a compile-time check against `OrderAddress`.
- `mapAddress` (private) — applies a converter to each present field of an address.

## Relationships
- `src/infrastructure/security/pii-encryption.ts` — supplies `encryptPii` / `decryptPii`, which do the actual cryptography.
- `src/domain-primitives/postal-address.ts` — supplies `POSTAL_ADDRESS_FIELDS` and `PostalAddressField`, the shared list of address PII fields.
- `src/types/index.ts` — supplies `OrderAddress` and `OrderBillingAddress`.
- `src/modules/orders/repository.ts` — per the module docs, the repository's `create` is the write path that encrypts.
- `src/modules/orders/model.ts` — per the module docs, `applyOrderTransform`'s `after` hook decrypts on read.
- `src/modules/orders/presenter.ts` — decrypts a staff note's timeline text.
- `src/modules/orders/services/timeline.ts` — `appendTimeline` encrypts the staff note text with the timeline-note AAD.
- `src/modules/orders/services/read.ts` and `src/modules/orders/services/reencrypt.ts` — other order-module consumers of this codec. The file itself doesn't show how they use it.

## Notes
- The order `_id` must be assigned before `encryptOrderPii` runs, because it is part of every AAD. A field copied to another order fails its authentication tag.
- Absent fields (e.g. optional `phone`, `vatNumber`) stay absent rather than becoming `"undefined"`.
- `orders.email` is intentionally left in plaintext, because login-style lookups need it.
- Adding a field to `OrderAddress` without adding it to the shared postal primitive makes `ORDER_ADDRESS_PII_FIELDS` resolve to `never`. This fails `tsc`, so the field can't silently be stored as plaintext.
- `decryptSerializedOrder` mutates its argument and expects `id` to have replaced `_id`.
