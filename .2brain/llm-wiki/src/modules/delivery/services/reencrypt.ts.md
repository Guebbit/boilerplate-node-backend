---
source: src/modules/delivery/services/reencrypt.ts
sha256: 52b4ead6bf2d7ecaa0801f24772642f0411b002208c2f3e252cbedd76c2d4cea
generated_at: 2026-10-29T03:42:57.160970+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/reencrypt.ts

## Purpose

Domain-level orchestration that re-encrypts every shipment's destination PII fields onto the newest key in the PII encryption key ring. It exists so the generic infrastructure re-encryption machinery (`@infrastructure/security/reencrypt`) can be driven with delivery-specific field mappings, AAD bindings, and the shipment repository in a single, dry-run-capable call.

## Key elements

- **`fieldsOf(shipment: ShipmentDocument): EncryptedField[]`** — (private) Flattens the shipment's `destination` object using `DESTINATION_FIELDS` into an array of `EncryptedField` entries. Each entry carries the stored ciphertext, a `piiBinding` derived from `destinationAad(field, shipment._id)`, and a `label` prefixed `delivery.shipments.destination.*`.
- **`reencryptShipments(dryRun?: boolean)`** — (exported) Calls `shipmentRepository.reencrypt` with a `{ destination: { $exists: true } }` filter, the live key ring from `getPiiEncryptionKeyRing()`, and `fieldsOf`. Passes `dryRun` through so the repo can count affected documents without writing.

## Relationships

- **`@infrastructure/security/reencrypt`** — Provides the `EncryptedField` type and the ops-script entry point (`reencrypt`) that ultimately invokes this module.
- **`@infrastructure/security/pii-encryption`** — Source of `getPiiEncryptionKeyRing` (the active key ring) and `piiBinding` (AAD-to-binding helper) used when building each field descriptor.
- **`../model`** — Supplies the `ShipmentDocument` type that `fieldsOf` consumes.
- **`../pii`** — Supplies `DESTINATION_FIELDS` (the list of address sub-fields) and `destinationAad` (per-field AAD derivation).
- **`../repository`** — The `shipmentRepository.reencrypt` method performs the actual read-modify-write; this file only assembles its parameters.
- **`./index`** — Barrel file for the delivery services directory; re-exports this module so callers can import `reencryptShipments` from `services`.

## Notes

- The `_id` is included in the AAD via `destinationAad(field, String(shipment._id))`, meaning a ciphertext cannot be transplanted to a different shipment document without breaking decryption.
- The filter `{ destination: { $exists: true } }` skips shipments that have no destination yet; there is no pagination visible here, so the repository is responsible for chunking if needed.
- `dryRun` defaults to `false` (a real write). Callers who want a safe count must pass `true` explicitly.
