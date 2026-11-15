---
source: src/modules/orders/pii.ts
sha256: e7deb1c2b329ab958b846cba183bb63ff15d6253c382a9304599ff95976feedc
generated_at: 2026-11-14T20:40:01.466089+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/pii.ts

## Purpose

Field-level encryption/decryption of personal text in an order record: the embedded shipping/billing addresses and the buyer's notes. It is the order-side twin of `addresses/pii.ts`, sharing the same `NODE_PII_ENCRYPTION_KEY` ring. It deliberately avoids mongoose getters/setters (ciphertext leaks through `toJSON`, double-encryption on subdoc copies, and encrypted paths silently break query filters) in favour of an explicit codec applied at the repository boundary.

## Key elements

- **`ORDER_ADDRESS_PII_FIELDS`** — the shared `POSTAL_ADDRESS_FIELDS` list, with a compile-time assertion: any `OrderAddress` key not in `PostalAddressField` collapses the type to `never`, failing `tsc` before it can be stored as plaintext.
- **`OrderAddressPath` / `ADDRESS_PATHS`** — the two optional address subdocuments (`shippingAddress`, `billingAddress`) walked on every order.
- **`addressAad`, `notesAad`, `timelineNoteAad`** — AAD (Associated Authenticated Data) string builders that bind a field to a specific order `_id`, so a field copied to another order fails its auth tag.
- **`encryptOrderPii(data, orderId)`** — returns a new object with every present PII field encrypted. Absent fields stay absent. The `orderId` must already be assigned (it is in every AAD).
- **`decryptOrderAddress(address, path, orderId)`** — decrypts a single stored address for a reader that holds the ciphertext row.
- **`decryptSerializedOrder(serialized)`** — decrypts a serialized order (post-`toJSON`, `_id` → `id`) in place; this is what wire-level readers see.
- **`mapAddress`** (internal) — iterates `ORDER_ADDRESS_PII_FIELDS`, applying a transform only to defined values.

## Relationships

- **`src/infrastructure/security/pii-encryption.ts`** — provides `encryptPii` / `decryptPii`; this module is the orders-domain caller.
- **`src/domain-primitives/postal-address.ts`** — supplies `POSTAL_ADDRESS_FIELDS` and `PostalAddressField`, the shared vocabulary that keeps the order and address modules in lock-step.
- **`src/types/index.ts`** — source of the `OrderAddress` contract type used for the compile-time field check.
- **`src/modules/orders/repository.ts`** — calls `encryptOrderPii` before persisting a new order.
- **`src/modules/orders/services/read.ts`** — `applyOrderTransform`'s `after` hook calls `decryptSerializedOrder` so readers get plaintext.
- **`src/modules/orders/services/timeline.ts`** — `appendTimeline` encrypts a staff note's text with `timelineNoteAad`.
- **`src/modules/orders/presenter.ts`** — decrypts timeline note text for presentation.
- **`src/modules/orders/model.ts`** — defines the Mongoose schema whose address subdocuments and `notes` field are the targets of this codec.
- **`src/modules/orders/services/reencrypt.ts`** — re-encrypts existing ciphertext (key rotation) using the same AAD helpers.

## Notes

- **AAD is order-scoped.** Because every AAD embeds the order `_id`, a PII field moved to a different order (or deserialised under the wrong id) will fail authentication rather than silently decrypting.
- **`orders.email` is intentionally plaintext** — login-style lookups depend on querying it.
- **`orderId` must exist before `encryptOrderPii` is called**; there is no way to re-bind the AAD afterwards without re-encryption.
- **Optional fields stay optional.** `mapAddress` skips `undefined` values, so an absent `phone` never becomes the string `"undefined"`.
- **Compile-time completeness guard:** adding a personal-data field to `OrderAddress` without also adding it to `PostalAddressField` makes `ORDER_ADDRESS_PII_FIELDS` type `never` and breaks the build.
