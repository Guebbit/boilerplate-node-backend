---
source: src/modules/delivery/services/reencrypt.ts
source_sha256: 6d9d008a6d1eae7eff5e1e5f17809ed74f4781b81578908349c9bb6b500a6fcc
context_sha256: 1201fb606fca650bd0b7178c5f6b23a5aa4a3c7b0c51be24ae590912c331f97a
generated_at: 2026-11-22T04:57:50.100930+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/reencrypt.ts

## Purpose
Moves the encrypted address copy on every shipment onto the newest `NODE_PII_ENCRYPTION_KEY`. It is the delivery module's piece of the ops script `reencrypt`, supplying the shipment-specific details to the generic re-encryption machinery in `@infrastructure/security/reencrypt`.

## Key elements
- `fieldsOf(shipment)` (module-private): returns one `EncryptedField` for each postal-address field present on `shipment.destination`. Missing fields are skipped. Each entry has:
  - `path`: `destination.<field>`
  - `stored`: the currently stored value
  - `binding`: `piiBinding(destinationAad(field, String(shipment._id)))`, which ties the value to the shipment's own `_id`
  - `label`: `delivery.shipments.destination.<field>`
- `reencryptShipments(dryRun = false)` (exported): calls `shipmentRepository.reencrypt(...)`. With `dryRun` set, it counts what a real run would move and writes nothing.

## Relationships
- `src/infrastructure/security/reencrypt.ts`: provides the `EncryptedField` type that `fieldsOf` returns.
- `src/infrastructure/security/pii-encryption.ts`: provides `getPiiEncryptionKeyRing()` (the key ring passed to the repository) and `piiBinding` (builds each field's binding).
- `src/domain-primitives/postal-address.ts`: `POSTAL_ADDRESS_FIELDS` defines which destination fields are iterated.
- `src/modules/delivery/pii.ts`: `destinationAad` builds the additional authenticated data for each field.
- `src/modules/delivery/model.ts`: provides the `ShipmentDocument` type.
- `src/modules/delivery/repository.ts`: exports `shipmentRepository`, whose `reencrypt` method is called with a filter, the ring and `fieldsOf`.
- `src/modules/delivery/services/index.ts`: a graph neighbor of this file. The file content does not show how the two interact.

## Notes
- The repository filter is `{ destination: { $exists: true } }`, so only shipments that have a `destination` are processed.
- The binding uses the shipment `_id`, so each encrypted value is tied to its own document.
