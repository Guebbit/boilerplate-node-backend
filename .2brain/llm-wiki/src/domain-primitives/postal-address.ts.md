---
source: src/domain-primitives/postal-address.ts
source_sha256: 4ee06248b16f0808649435be580808782ea6e076fd713f06844a5f4793661ed7
context_sha256: 367b6e5e3a915f2c4c4be58b5bbcc89b7e890549513ef44d242665906fff7a84
generated_at: 2026-11-22T02:33:00.995253+00:00
model: claude-code:claude-sonnet-5-5
---

# src/domain-primitives/postal-address.ts

## Purpose
Defines the single canonical list of postal address fields that count as personal data and are encrypted at rest. It sits below every module tier so that orders, delivery, and the address book (which don't all depend on each other) can share one answer. It imports nothing.

## Key elements
- `PostalAddressField` (type): union of the field names `'fullName' | 'street' | 'city' | 'zip' | 'country' | 'phone'`, derived from a private `FIELDS` const tuple.
- `POSTAL_ADDRESS_FIELDS` (const): `readonly PostalAddressField[]` of every address field encrypted at rest, in reporting order.

## Relationships
- `src/infrastructure/persistence/postal-address-paths.ts`: holds the stored paths for these fields, keyed by `PostalAddressField`.
- `src/modules/addresses/pii.ts` and `src/modules/orders/pii.ts`: tie this list to their own address shapes at compile time, so a field added to a module's shape but not here fails `tsc`.
- `src/modules/delivery/pii.ts`: listed as a neighbor; the module doc names delivery as a consumer of this list.
- `src/modules/invoicing/pii.ts`: deliberately does not use this list; it keeps its own five fields.
- `src/modules/addresses/reencrypt.ts`, `src/modules/delivery/services/reencrypt.ts`, `src/modules/cart/services/checkout.ts`: graph neighbors. The file itself says nothing about how they use it.

## Notes
- Invoicing keeps its own five-field list on purpose: an invoice carries no phone (data minimisation). Adding a field here does not affect invoicing.
- Adding a field means editing `FIELDS` here. The compile-time ties in the modules' `pii.ts` files will flag mismatches with their address shapes.
