---
source: src/modules/orders/pii.ts
sha256: 83dde9f092dc068932b184ed065b2fd68a83ebe4e4b980d26503432fb51fe9ee
generated_at: 2026-11-08T06:53:52.836111+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/pii.ts

## Purpose

Explicit field-level encryption/decryption codec for the PII an order freezes: the two embedded postal addresses (shipping, billing) and the buyer's free-text notes. It exists as a deliberate alternative to Mongoose getters/setters, avoiding the pitfalls where `toJSON` leaks ciphertext, subdocument copies double-encrypt, or query filters silently match nothing. It is the order-side twin of `addresses/pii.ts` under the same `NODE_PII_ENCRYPTION_KEY` ring.

## Key elements

- **`encryptOrderPii(data, orderId)`** — Takes the order being created and returns a new object with every present address field and `notes` encrypted. Absent fields stay absent. `orderId` must already be assigned because it is baked into every AAD.
- **`decryptOrderAddress(address, path, orderId)`** — Decrypts a single stored address back to plaintext, for readers that hold the ciphertext row directly (e.g. invoice issuers).
- **`decryptSerializedOrder(serialized)`** — Decrypts a serialized order (where `_id` → `id`) in place; the shape every wire reader sees.
- **`mapAddress(address, convert)`** — Internal helper that walks `POSTAL_ADDRESS_FIELDS`, applying `convert` only to fields that are present so optional `phone` never becomes `"undefined"`.
- **`addressAad(path, field, orderId)` / `notesAad(orderId)` / `timelineNoteAad(orderId)`** — AAD string constructors binding each ciphertext to a specific order and field.
- **`ADDRESS_PATHS`** — `['shippingAddress', 'billingAddress']`; the two paths walked on every order.
- **`OrderAddressPath`** — Union type of the two address paths.

## Relationships

- **`src/infrastructure/security/pii-encryption.ts`** — Source of the `encryptPii` / `decryptPii` primitives this module wraps with order-specific AADs.
- **`src/domain-primitives/postal-address.ts`** — Provides `POSTAL_ADDRESS_FIELDS` (the list of fields iterated in `mapAddress`) and the `PostalAddressField` type used in AAD construction.
- **`src/types/index.ts`** — Supplies the `OrderAddress` type that shapes the embedded address documents.
- **`src/modules/orders/repository.ts`** — `orderRepository.create` calls `encryptOrderPii` before persisting.
- **`src/modules/orders/services/read.ts`** — `applyOrderTransform`'s `after` hook calls `decryptSerializedOrder` so every read path returns plaintext.
- **`src/modules/orders/services/timeline.ts`** — `appendTimeline` encrypts a staff note's text with the same codec (`timelineNoteAad`).
- **`src/modules/orders/presenter.ts`** — Decrypts timeline note text on output using the same AAD scheme.

## Notes

- `orders.email` is intentionally **not** encrypted here — login-style lookups require it in plaintext.
- The AAD embeds the order `_id`, so a ciphertext field moved to a different order will fail its authentication tag. This is the primary cross-order tamper-detection mechanism.
- `orderId` must be assigned **before** calling `encryptOrderPii`; it is not derived from the document.
- The module doc references `addresses/pii.ts` as a structural twin; the two share the key ring but have independent AAD namespaces (`orders:` vs. the addresses namespace).
- `decryptSerializedOrder` mutates its argument in place — callers pass the serialized object expecting it to be transformed, not copied.
