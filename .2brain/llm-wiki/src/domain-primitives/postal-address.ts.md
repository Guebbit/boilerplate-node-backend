---
source: src/domain-primitives/postal-address.ts
sha256: 79e7703e9da9127e955b4202fe19640eab6e704ca8371bee0c4ecd831acaa0ec
generated_at: 2026-11-08T03:15:47.741138+00:00
model: ollama:qwen3.8:27b
---

# src/domain-primitives/postal-address.ts

## Purpose

Defines the canonical list of postal-address fields that are personal data, shared by every module that encrypts an address at rest. It lives in `domain-primitives` (below all feature tiers) because orders, delivery, and the address book each need the same answer without depending on one another.

## Key elements

- **`PostalAddressField`** — union type of the individual field names (`'fullName' | 'street' | 'city' | 'zip' | 'country' | 'phone'`).
- **`POSTAL_ADDRESS_FIELDS`** — the ordered `readonly` array of those field names, used at runtime by the PII/reencrypt modules to know which keys to encrypt.
- **`MissingFromList`** (internal) — a compile-time check: `Exclude<keyof OrderAddress, PostalAddressField>` must resolve to `never`. If it doesn't, `POSTAL_ADDRESS_FIELDS` is typed as `never` and the assignment fails `tsc`, catching any new `OrderAddress` field that hasn't been added to the list.

## Relationships

- **`src/types/index.ts`** — provides the `OrderAddress` type; the contract check (`MissingFromList`) is computed directly against `keyof OrderAddress`.
- **`src/modules/orders/pii.ts`** / **`src/modules/orders/services/reencrypt.ts`** — consume `POSTAL_ADDRESS_FIELDS` to know which address fields to encrypt/decrypt for orders.
- **`src/modules/delivery/pii.ts`** / **`src/modules/delivery/services/reencrypt.ts`** — same consumption pattern for delivery records.
- **`src/modules/addresses/pii.ts`** — the address book uses the same list when encrypting stored addresses.
- **`src/modules/invoicing/pii.ts`** — does **not** use `POSTAL_ADDRESS_FIELDS`; it keeps its own shorter five-field list (omits `phone`) for data-minimisation reasons.

## Notes

- The list is intentionally a plain array, not derived from `keyof OrderAddress` at runtime. The compile-time `satisfies` + `MissingFromList` guard is what enforces equality.
- Invoicing deliberately diverges (five fields, no `phone`). If you add a field to `OrderAddress`, invoicing will *not* automatically pick it up—update its local list separately.
- Field order in `POSTAL_ADDRESS_FIELDS` is the order fields are reported (e.g., in audit logs). Preserve order when appending.
