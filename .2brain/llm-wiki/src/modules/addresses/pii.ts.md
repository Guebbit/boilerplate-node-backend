---
source: src/modules/addresses/pii.ts
sha256: c6d19ec4861c02495da7af86678fedf8de2c9c72cf42eb0848c4e8220efb3b23
generated_at: 2026-09-27T14:39:13.252187+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/pii.ts

## Purpose

Centralizes per-field PII encryption and decryption for address-book entries (`fullName`, `street`, `city`, `zip`, `country`, `phone`). It exists so `./repository` can encrypt whole entries on write and decrypt them on read without duplicating six-field logic at each call site.

## Key elements

- **`AddressPiiFields`** — `Pick<AddressItem, 'fullName' | 'street' | 'city' | 'zip' | 'country' | 'phone'>`; the shared shape of the six GDPR-flagged fields present on both stored entries and incoming writes.
- **`encryptAddressItem<T extends AddressPiiFields>(item: T): T`** — Returns a **new** object with the six PII fields wrapped in `encryptPii`; all other properties (`label`, `default`, `_id`, …) pass through unchanged. The generic `T` lets it accept either a full `AddressItem` or the contract's `AddressInput`.
- **`decryptAddressItem(item: AddressItem): AddressItem`** — Returns a **new** object with the six PII fields passed through `decryptPii`. Each call supplies a human-readable context label (e.g. `'address fullName'`) for downstream error reporting.

## Relationships

- **`src/infrastructure/security/pii-encryption.ts`** — Provides `encryptPii` / `decryptPii`; this file is a thin per-field caller of those two primitives.
- **`src/modules/addresses/model.ts`** — Supplies the `AddressItem` type that defines the field names and optionality used by `AddressPiiFields` and both helpers.
- **`src/modules/addresses/repository.ts`** — The sole caller. Uses `encryptAddressItem` in the `create` seed path and `addEntry`; uses `decryptAddressItem` for every read (service wire mapping, checkout order snapshot). **Not** used by `updateEntry`, which encrypts only the fields a `PATCH` actually changed via inline `if` checks.
- **`tests/integration/scenarios/shop.test.ts`** — Integration test that exercises the address flow end-to-end, thereby exercising the encrypt/decrypt round-trip through the repository.

## Notes

- `phone` is optional. Both helpers guard with `item.phone === undefined ? {} : { phone: … }` so an absent field is neither encrypted nor produced in the output.
- `updateEntry` deliberately bypasses these helpers; partial-field encryption lives inline in `./repository`. Don't expect to find a "partial encrypt" variant here.
- Both functions are **pure** (spread-copy, no mutation), so callers can safely reuse the input object afterward.
