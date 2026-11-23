---
source: src/infrastructure/persistence/postal-address-paths.ts
source_sha256: 9bf5da79410595e594a9f2880c1c2e0e792512b9ded9b37473e095d2eb9e7aee
context_sha256: 5612ae2b1ab021cb940b93c6e37e81ee5b4b5d9c565206054be19ee722526368
generated_at: 2026-11-22T03:03:39.307963+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/postal-address-paths.ts

## Purpose
Defines the single Mongoose path definition for a stored postal address (six fields). Every schema that embeds an address reuses it, so the stored shape is declared in one place.

## Key elements
- `postalAddressPaths`: a const object with one entry per address field.
  - `fullName`, `street`, `city`, `zip` and `country` are `{ type: String, required: true }`.
  - `phone` is `{ type: String }` and is optional. It is the carrier's fallback contact.
  - It can be spread into a schema definition or passed whole to `new Schema(...)`.
  - It uses `satisfies Record<PostalAddressField, SchemaDefinitionProperty>`, so it is keyed by the primitive's field list.

## Relationships
- `src/domain-primitives/postal-address.ts`: supplies the `PostalAddressField` type, imported type-only. If a field is added to that list and not added here, `tsc` fails.
- `src/modules/addresses/model.ts` (the address book), `src/modules/orders/model.ts` (an order's two addresses) and `src/modules/delivery/model.ts` (a shipment's destination) are the embedding schemas named in the file's header comment. The file's content does not show how each one imports it.

## Notes
- The `satisfies` check is meant to prevent Mongoose strict mode from silently dropping a field at a copy that was missed.
- The invoice buyer (`src/modules/invoicing/pii.ts` `PARTY_FIELDS`) is intentionally not built from this. It is a five-field projection with its own list, because a new address field needs a separate invoicing decision (VAT Directive Art. 226, "full address"). The invoice seller is the shop's identity, a different concept.
