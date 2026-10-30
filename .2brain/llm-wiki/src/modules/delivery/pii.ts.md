---
source: src/modules/delivery/pii.ts
sha256: 3e10be471f3a3d46d6b77597f5d32756eda39873a64361f3e8bebd4c05de2b29
generated_at: 2026-10-29T03:36:08.744912+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/pii.ts

## Purpose

Field-level encryption/decryption of the destination address stored on a shipment record. It is the delivery-side twin of the order's PII module, using the same `NODE_PII_ENCRYPTION_KEY` ring. Each address field is encrypted with an AAD that binds it to the specific shipment's `_id`, so a ciphertext cannot be transplanted to another shipment without failing the auth tag.

## Key elements

- **`DESTINATION_FIELDS`** — `readonly` tuple of the six address fields (`fullName`, `street`, `city`, `zip`, `country`, `phone`). Both encrypt and decrypt iterate this list, keeping them in sync.
- **`destinationAad(field, shipmentId)`** — Builds the associated-data string (`delivery:shipments.destination.<field>:<shipmentId>`) that ties one field to one shipment.
- **`mapDestination(address, convert)`** — Internal helper. Walks `DESTINATION_FIELDS`, applies `convert` only to present fields (absent fields stay absent, so optional `phone` never becomes `"undefined"`), and returns a fresh plain object (safe for wire or storage).
- **`encryptDestination(address, shipmentId)`** — Encrypts every present field using `encryptPii` with the per-field AAD. The `shipmentId` must already be assigned (it is part of the AAD).
- **`decryptDestination(address, shipmentId)`** — Decrypts a stored destination back to clear text.

## Relationships

- **`src/infrastructure/security/pii-encryption.ts`** — Source of `encryptPii` / `decryptPii`; this module is a thin, domain-specific wrapper around those primitives.
- **`src/modules/delivery/services/cut.ts`** — The sole writer. Calls `encryptDestination` using the shipment's pre-allocated `_id` before the document is persisted.
- **`src/modules/delivery/presenter.ts`** — The sole reader. Calls `decryptDestination` when building the wire shape for API responses.
- **`src/modules/delivery/services/reencrypt.ts`** — Likely re-encrypts stored ciphertexts (e.g., key rotation) by decrypting with the old key and re-encrypting with the new one.
- **`src/types/index.ts`** — Provides the `OrderAddress` type shared across the module boundary.
- **`src/modules/delivery/tests/integration/destination.test.ts`** — Integration tests that exercise the encrypt → store → decrypt round-trip.

## Notes

- The shipment's `_id` must be generated **before** calling `encryptDestination`; it is embedded in the AAD and cannot be changed afterward.
- `mapDestination` deliberately returns a plain object rather than mutating the input. This matters when the input is a hydrated Mongoose subdocument whose internals (e.g., `__v`, methods) must not leak into stored or wire data.
- `phone` is the only optional field; the loop skips `undefined` values rather than coercing them to a string.
- This module is intentionally a "twin" of the order-side PII module. If you change one, check the other for parity.
