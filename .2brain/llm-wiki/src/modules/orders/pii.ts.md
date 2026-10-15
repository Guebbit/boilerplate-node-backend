---
source: src/modules/orders/pii.ts
sha256: 6b4ca739d2387400c7ef7c36f6ecf890c8ce15c625c22f53f0be0d1856d2ce23
generated_at: 2026-10-15T11:05:38.120086+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/pii.ts

## Purpose

Field-level encryption codec for the PII an order freezes: both embedded addresses (shipping & billing) and the buyer's notes. It is the order-domain twin of `addresses/pii.ts`, sharing the same `NODE_PII_ENCRYPTION_KEY` ring. It exists as an explicit, standalone set of transform functions rather than Mongoose getters/setters, so that `toJSON` output, query filters, and sub-document copying all behave predictably.

## Key elements

- **`ADDRESS_PATHS`** – readonly list (`'shippingAddress' | 'billingAddress'`) defining which address sub-documents are PII-encrypted.
- **`ADDRESS_FIELDS`** – readonly list of the six text fields inside one address (`fullName`, `street`, `city`, `zip`, `country`, `phone`). Single source of truth so encrypt and decrypt always walk the same set.
- **`addressAad(path, field, orderId)`** / **`notesAad(orderId)`** – build the Associated-Data (AAD) string that binds a ciphertext field to a specific order. Tampering or cross-order reuse of a field causes an auth-tag mismatch.
- **`mapAddress(address, convert)`** – (private) iterates `ADDRESS_FIELDS`, applies `convert` only to present fields, preserves `undefined` for the optional `phone`.
- **`encryptOrderPii<T>(data, orderId)`** – returns a new object with every present PII field encrypted. Caller must supply the order's `_id` *before* calling (it appears in every AAD).
- **`decryptOrderAddress<T>(address, path, orderId)`** – decrypts a single stored address; used by readers that already hold the ciphertext row (e.g. invoice issuers).
- **`decryptSerializedOrder(serialized)`** – decrypts a serialized order **in place** (after `_id` → `id` rename); the generic hook every wire-format reader applies.

## Relationships

- **`src/infrastructure/security/pii-encryption.ts`** — provides `encryptPii` / `decryptPii`; this module is its primary order-domain caller.
- **`src/modules/orders/repository.ts`** — `orderRepository.create` invokes `encryptOrderPii` before persisting, so all writes are encrypted at the seam.
- **`src/modules/orders/services/read.ts`** — its `applyOrderTransform` after-hook calls `decryptSerializedOrder` so every read response carries plaintext.
- **`src/modules/orders/services/reencrypt.ts`** — key-rotation path that decrypts stored fields (via `decryptOrderAddress`) and re-encrypts under the new key (via `encryptOrderPii`).
- **`src/modules/orders/model.ts`** — defines the order schema whose `shippingAddress`, `billingAddress`, and `notes` paths this module encrypts/decrypts.

## Notes

- **Not Mongoose middleware.** The file deliberately avoids getters/setters: a getter makes `toJSON` leak ciphertext, a setter fires on query filters (an encrypted path in a filter silently matches nothing), and copying a foreign sub-document would double-encrypt.
- **`orders.email` is intentionally left in plaintext** — it supports login-style lookups and is not covered by this codec.
- **AAD is per-field and per-order.** A ciphertext field physically moved to another order's document will fail its auth tag on decrypt; there is no bulk rekey without an explicit decrypt→encrypt pass.
- **Order of operations on write:** the order's `_id` must be generated *before* `encryptOrderPii` is called, because the id is embedded in every AAD string.
- **Absent ≠ empty.** The codec never materialises `undefined` as the string `"undefined"`; absent fields stay absent in both directions.
