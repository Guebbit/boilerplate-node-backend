---
source: src/modules/delivery/pii.ts
source_sha256: 2743236847a6d562b4cd2415b20fd954c3b85a6305fc18f485db3ee125299219
context_sha256: 8d85516d23605d019b641502e8daacc9b1ad8ea7257366872eb1647acacc4f46
generated_at: 2026-11-22T04:51:23.068457+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/pii.ts

## Purpose
Field-level encryption for the destination address stored on a shipment. It is the delivery-module twin of `src/modules/orders/pii.ts` and uses the same `NODE_PII_ENCRYPTION_KEY` ring. The shipment's copy of the address is personal data in its own right: it is removed along with the order's address (`order.redacted`). Each field's AAD includes the shipment's `_id`, so a ciphertext moved to another shipment fails its authentication tag.

## Key elements
- `destinationAad(field, shipmentId)`: exported. Returns the AAD string `delivery:shipments.destination.<field>:<shipmentId>`.
- `encryptDestination(address, shipmentId)`: encrypts each present address field with `encryptPii`. It takes a `Types.ObjectId` and stringifies it for the AAD.
- `decryptDestination(address, shipmentId)`: decrypts each present field with `decryptPii`. It takes the shipment id as a string. The label `shipment destination <field>` is passed as the third argument to `decryptPii`.
- `mapDestination` (private): iterates `POSTAL_ADDRESS_FIELDS` and applies a converter to every field that is not `undefined`. It builds a fresh plain object holding only those address fields.

## Relationships
- `src/domain-primitives/postal-address.ts`: supplies `POSTAL_ADDRESS_FIELDS` and the `PostalAddressField` type, which define which fields are processed.
- `src/infrastructure/security/pii-encryption.ts`: supplies `encryptPii` and `decryptPii`, which do the actual cryptography.
- `src/types/index.ts`: supplies the `OrderAddress` type used for inputs and outputs.
- `src/modules/delivery/services/cut.ts`: the documented writer. It encrypts the destination under the shipment's pre-allocated `_id`.
- `src/modules/delivery/presenter.ts`: the documented sole reader. It decrypts while building the wire shape.
- `src/modules/delivery/services/reencrypt.ts` and `src/modules/delivery/tests/integration/destination.test.ts`: both are graph neighbors, but this file's content doesn't show how they use it.

## Notes
- The shipment `_id` must be assigned before encrypting, because it is part of the AAD.
- `mapDestination` copies the input into a plain object. This keeps Mongoose subdocument internals off the wire.
- Absent fields (e.g. the optional `phone`) stay absent instead of being converted to the string `"undefined"`.
- `mapDestination` casts its result to `OrderAddress`. The cast relies on the required fields being present on any stored address.
- The encrypt side takes an `ObjectId`, while the decrypt side takes a string.
