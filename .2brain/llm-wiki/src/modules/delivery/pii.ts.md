---
source: src/modules/delivery/pii.ts
sha256: 2743236847a6d562b4cd2415b20fd954c3b85a6305fc18f485db3ee125299219
generated_at: 2026-11-08T05:32:06.089108+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/pii.ts

## Purpose

Field-level encryption/decryption of the destination address stored on a shipment. It is the delivery-side twin of `orders/pii.ts`, using the same `NODE_PII_ENCRYPTION_KEY` ring. The encrypted address records *where this parcel went*; the AAD binds every field to the shipment's `_id` so a ciphertext cannot be replayed against a different shipment.

## Key elements

- **`destinationAad(field, shipmentId)`** — Builds the associated-data string (`delivery:shipments.destination.{field}:{shipmentId}`) that ties one field's ciphertext to one shipment.
- **`mapDestination(address, convert)`** — (internal) Iterates `POSTAL_ADDRESS_FIELDS`, applies `convert` to each *present* field, and returns a fresh plain object. Absent fields (e.g. optional `phone`) are left out rather than serialized as `"undefined"`.
- **`encryptDestination(address, shipmentId)`** — Encrypts every present address field using `encryptPii` with the per-field AAD. `shipmentId` must already be assigned (it is baked into the AAD).
- **`decryptDestination(address, shipmentId)`** — Reverses the above via `decryptPii`, passing the same AAD and a human-readable label for error messages.

## Relationships

- **`@infrastructure/security/pii-encryption`** — Provides `encryptPii` / `decryptPii`; this file is a caller, not a re-exporter.
- **`@domain-primitives/postal-address`** — Supplies the canonical `POSTAL_ADDRESS_FIELDS` list and the `PostalAddressField` type, ensuring the field set stays in sync with the order-side twin.
- **`@types`** — Imports the `OrderAddress` shape that is both the input and output of the encrypt/decrypt functions.
- **`services/cut.ts`** — Sole write path: calls `encryptDestination` under the shipment's pre-allocated `_id` before the document is persisted.
- **`presenter.ts`** — Sole read path: calls `decryptDestination` to rebuild the clear-text wire shape.
- **`tests/integration/destination.test.ts`** — Integration tests exercising the round-trip and AAD-binding guarantees.

## Notes

- The shipment `_id` **must exist before** `encryptDestination` is called; the id is part of the AAD, so encrypting first and inserting second is a bug, not a supported pattern.
- `mapDestination` returns a plain object (not a Mongoose subdocument), deliberately stripping any hydrated-document internals so they cannot leak onto the wire.
- The trailing `as OrderAddress` cast in `mapDestination` is safe only because the required address fields are guaranteed present by the domain invariants; it is *not* a general-purpose partial→full coercion.
- A ciphertext for one shipment will fail authentication (tag mismatch) if decrypted under a different `_id`—there is no key-rotation or re-encrypt path in this file; that concern lives elsewhere in the delivery module.
