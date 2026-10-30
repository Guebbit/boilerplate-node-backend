---
source: src/modules/orders/pii.ts
sha256: f3a6d28d7f747e214a24358fbc49f0d12a1f8fbde348ab23fc0c32bc08bb4ca1
generated_at: 2026-10-29T04:43:51.605421+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/pii.ts

## Purpose

Field-level encryption/decryption of the PII fields on an order document — the embedded shipping/billing addresses and the buyer's `notes`. It is the order-domain twin of `addresses/pii.ts`, operating under the same `NODE_PII_ENCRYPTION_KEY` ring. It exists as an explicit codec (encrypt-before-write, decrypt-after-read) rather than via Mongoose getters/setters, to avoid `toJSON` leaking ciphertext, double-encryption on subdocument copies, and silent filter mismatches.

## Key elements

- **`ADDRESS_PATHS`** — `['shippingAddress', 'billingAddress']`; the two embedded address slots every order may carry.
- **`ADDRESS_FIELDS`** — `['fullName', 'street', 'city', 'zip', 'country', 'phone']`; the per-address fields walked by both encrypt and decrypt so the list is defined once.
- **`addressAad(path, field, orderId)`** / **`notesAad(orderId)`** — build the AES-GCM associated-data strings that bind each ciphertext to a specific order `_id`, field, and path.
- **`mapAddress(address, convert)`** — internal helper that iterates `ADDRESS_FIELDS`, applies `convert` only to fields present (`!== undefined`), and returns a new object.
- **`encryptOrderPii<T>(data, orderId)`** — pure function that returns a new object with every present PII field encrypted. Called by the repository *before* the write; the `_id` must already be assigned because it is embedded in every AAD.
- **`decryptOrderAddress(address, path, orderId)`** — decrypts one stored address in isolation (used by readers like invoice issuers that hold a ciphertext row).
- **`decryptSerializedOrder(serialized)`** — mutates a serialized order (post-`_id → id` rename) in place, decrypting both addresses and `notes`. This is the path taken by the read-transform hook so API responses carry plaintext.

## Relationships

- **`src/infrastructure/security/pii-encryption.ts`** — sole source of the symmetric `encryptPii` / `decryptPii` primitives used throughout this file.
- **`src/modules/orders/repository.ts`** — calls `encryptOrderPii` inside `create` so that plaintext PII never reaches the database.
- **`src/modules/orders/services/read.ts`** — invokes `decryptSerializedOrder` in the `applyOrderTransform` `after` hook so every order returned over the wire is transparently decrypted.
- **`src/modules/orders/services/reencrypt.ts`** — re-encryption path that would read ciphertext (via `decryptOrderAddress`) and re-encrypt under a new key.
- **`src/types/index.ts`** — provides the `OrderAddress` interface that this module imports for its address field typing.
- **`src/modules/orders/model.ts`** — defines the Mongoose schema whose `shippingAddress`, `billingAddress`, and `notes` paths are the encryption targets; this module operates on the plain-object shape the model produces.

## Notes

- **Order of operations on write:** the order `_id` must be generated *before* `encryptOrderPii` is called, because every AAD string embeds it. Swapping the order would break all subsequent decryptions.
- **`email` is intentionally plaintext.** Login-style lookups need to query it; encrypting it would make those queries impossible.
- **Optional `phone` field:** `mapAddress` checks `!== undefined` before converting, so an absent `phone` stays absent rather than becoming the literal string `"undefined"`.
- **`decryptSerializedOrder` mutates in place** and expects the serialized shape (where `_id` has already been renamed to `id`). It is not a pure function — callers that need the original must clone first.
- **AAD binding means cross-order field moves fail authentication.** Copying an address subdocument into a different order's `_id` context will cause a GCM tag mismatch at decrypt time.
