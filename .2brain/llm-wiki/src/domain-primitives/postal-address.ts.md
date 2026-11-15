---
source: src/domain-primitives/postal-address.ts
sha256: 4ee06248b16f0808649435be580808782ea6e076fd713f06844a5f4793661ed7
generated_at: 2026-11-14T17:50:59.096869+00:00
model: ollama:qwen3.8:27b
---

# src/domain-primitives/postal-address.ts

## Purpose

Defines the single canonical list of personal-data fields in a postal address that are encrypted at rest. It sits in the lowest tier (domain-primitives) so that three modules—orders, delivery, and the address book—that do not all depend on one another can share the same field list without introducing circular dependencies.

## Key elements

- **`FIELDS`** (private `const`) — The six address fields as a literal tuple: `fullName`, `street`, `city`, `zip`, `country`, `phone`.
- **`PostalAddressField`** (exported type) — Union type `(typeof FIELDS)[number]`, i.e. the string-literal union of the six field names. Used as the key type in the persistence path map.
- **`POSTAL_ADDRESS_FIELDS`** (exported `readonly` array) — The six fields in the order they are reported. Consumed by each module's PII/reencrypt logic to know exactly which fields to walk.

## Relationships

- **`src/infrastructure/persistence/postal-address-paths.ts`** — Stores the JSON storage paths for each field, keyed by `PostalAddressField`. This file supplies the key type.
- **`src/modules/addresses/pii.ts`** / **`src/modules/orders/pii.ts`** — Tie this field list to their respective address shapes at compile time; a field added to the shape but missing here fails `tsc`.
- **`src/modules/addresses/reencrypt.ts`** / **`src/modules/delivery/services/reencrypt.ts`** / **`src/modules/orders/services/reencrypt.ts`** — Re-encryption services that iterate `POSTAL_ADDRESS_FIELDS` to locate and re-encrypt each field at its stored path.
- **`src/modules/delivery/pii.ts`** — Delivery module's PII definition, consuming the same field list.
- **`src/modules/invoicing/pii.ts`** — Deliberately keeps its own five-field list (excludes `phone`) for data minimisation; it does **not** use `POSTAL_ADDRESS_FIELDS`.
- **`src/modules/cart/services/checkout.ts`** — Checkout flow that passes address data through the order/creation pipeline; consumes address fields that are subsequently encrypted per the list here.

## Notes

- **Invoicing is the exception.** It intentionally carries only five of the six fields (no `phone`). Do not "fix" this by making invoicing import `POSTAL_ADDRESS_FIELDS`; the divergence is a data-minimisation policy, not an oversight.
- **Order matters.** `POSTAL_ADDRESS_FIELDS` is documented as "the order they are reported." Downstream reencrypt/reporting code may rely on the sequence.
- **Compile-time coupling is the safety net.** Modules like `addresses/pii.ts` and `orders/pii.ts` tie this list to their local type. Adding a new PII field to the address shape without adding it here (or vice-versa) will be caught by `tsc`—no runtime guard is needed.
