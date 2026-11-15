---
source: src/infrastructure/persistence/postal-address-paths.ts
sha256: 9bf5da79410595e594a9f2880c1c2e0e792512b9ded9b37473e095d2eb9e7aee
generated_at: 2026-11-14T18:14:15.864203+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/postal-address-paths.ts

## Purpose

Defines the single canonical Mongoose path object for a postal address (six fields) so that every schema embedding an address—address book, order, delivery—shares one definition. The `satisfies Record<PostalAddressField, …>` constraint ties the object to the domain-primitive field list, making it a compile-time error to add a field to `PostalAddressField` without also updating this file (and Mongoose strict mode then blocks silent data loss at runtime).

## Key elements

- **`postalAddressPaths`** (const, exported) — Mongoose `SchemaDefinitionProperty` map with six keys: `fullName`, `street`, `city`, `zip`, `country` (all `required: true`), and `phone` (optional). Spread into a sub-schema or passed whole to `new Schema(…)`.

## Relationships

- **`src/domain-primitives/postal-address.ts`** — Imports the `PostalAddressField` union type; the `satisfies` clause here enforces that every member of that union has a corresponding path entry.
- **`src/modules/addresses/model.ts`** — Consumes `postalAddressPaths` to define the address-book document schema.
- **`src/modules/orders/model.ts`** — Consumes `postalAddressPaths` for the two address sub-documents (buyer / delivery) on an order.
- **`src/modules/delivery/model.ts`** — Consumes `postalAddressPaths` for the shipment destination sub-document.

## Notes

- The invoice *buyer* fields live in `invoicing/pii.ts` (`PARTY_FIELDS`) as a deliberate five-field projection; adding a field here does **not** automatically change the invoice. A new address field requires its own invoicing decision (VAT Directive Art. 226 "full address").
- `phone` is the only non-required field; the module comment calls it "the carrier's fallback."
- The object is intentionally a plain const (not a `Schema` instance) so it can be spread into any parent schema without nesting a `Schema` inside a `Schema`.
