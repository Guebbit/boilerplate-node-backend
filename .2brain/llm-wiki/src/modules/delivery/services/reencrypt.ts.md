---
source: src/modules/delivery/services/reencrypt.ts
sha256: 6d9d008a6d1eae7eff5e1e5f17809ed74f4781b81578908349c9bb6b500a6fcc
generated_at: 2026-11-08T05:38:40.012211+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/reencrypt.ts

## Purpose

Application-level orchestration for re-encrypting every shipment's `destination` address onto the newest PII encryption key. It is invoked by the ops `reencrypt` script and delegates the actual field-by-field work to the shared infrastructure re-encrypt engine.

## Key elements

- **`reencryptShipments(dryRun = false)`** – The sole export. Builds the filter, key-ring, and field-mapper, then calls `shipmentRepository.reencrypt`. `dryRun` performs a count without writing.
- **`fieldsOf(shipment)`** (module-private) – Flattens `POSTAL_ADDRESS_FIELDS` into an `EncryptedField[]` for one shipment, computing the PII binding via `destinationAad(field, shipment._id)` and skipping undefined destination sub-fields.

## Relationships

- **`@infrastructure/security/pii-encryption`** – Imports `getPiiEncryptionKeyRing` (supplies the key ring to the engine) and `piiBinding` (wraps each field's AAD value into the binding format the engine expects).
- **`@infrastructure/security/reencrypt`** – Imports the `EncryptedField` type; the actual re-encryption loop lives in that module.
- **`@domain-primitives/postal-address`** – Imports `POSTAL_ADDRESS_FIELDS` to know which sub-fields of `destination` carry PII.
- **`../model`** – Imports `ShipmentDocument` type for the `fieldsOf` signature.
- **`../pii`** – Imports `destinationAad` to build the per-field, per-shipment authentication data for the PII binding.
- **`../repository`** – Calls `shipmentRepository.reencrypt`, which iterates the collection and applies the infrastructure re-encrypt primitive per document.
- **`services/index.ts`** – Re-exports `reencryptShipments` so consumers can import from the services barrel.

## Notes

- The binding AAD is **per-field and per-shipment** (`destinationAad(field, String(shipment._id))`), so a key rotation that changes the ring does not alter the AAD — only the key ID changes.
- The filter `{ destination: { $exists: true } }` means shipments with no `destination` subdocument are silently skipped.
- `fieldsOf` is passed as a function (not pre-computed), so it is evaluated once per document inside the repository loop; it intentionally returns `[]` for missing sub-fields rather than an empty-string entry.
