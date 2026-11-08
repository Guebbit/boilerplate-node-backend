---
source: scenarios/addresses.ts
sha256: bdc69a566d41df605f2f7fd512b137a48f86c335b8488d24db838d8643ef6105
generated_at: 2026-11-08T02:27:18.456693+00:00
model: ollama:qwen3.8:27b
---

# scenarios/addresses.ts

## Purpose

Seeds the address-book collection for the demo dataset. It defines three fixture books (admin with two entries, ordinary customer with one, second shopper with one) so that order-snapshot behaviour, "exactly one default" logic, and two-shopper journeys are all observable against live data. Exposed as a `shopModule` entry that `seedShop` calls.

## Key elements

- **`addressBookFixtures`** (const array) — Three `makeAddressBook` results keyed to `SEED_ADMIN_ID`, `SEED_USER_ID`, and `SEED_SECOND_SHOPPER_ID`. Admin has a default "home" + non-default "office" pair; the other two each have a single default entry. The customer's entry intentionally omits `phone` to exercise the optional field.
- **`seedAddressBooksCollection`** (function) — Maps every fixture through `insertIfAbsentForOwner(addressBookRepository, book)` in parallel; returns `Promise<SeedOutcome[]>`.
- **`shopModule`** (exported const) — `{ seed: seedAddressBooksCollection }`; the shape consumed by the generated `shop-modules` table.

## Relationships

- **scenarios/accounts.ts** — Supplies the three `SEED_*_ID` constants used as `userId` in every fixture.
- **scenarios/seed.ts** — Provides the `SeedOutcome` type and the `insertIfAbsentForOwner` helper that gives per-owner idempotency.
- **src/modules/addresses/factories.ts** — `makeAddressBook` builds each fixture object from the item arrays.
- **src/modules/addresses/repository.ts** — `addressBookRepository` is the persistence target passed to `insertIfAbsentForOwner`.

## Notes

- Idempotency is keyed on `userId`, **not** on the book's `_id`. The book-level `_id` is generated but never looked up; each entry's `_id` is likewise minted fresh (`new Types.ObjectId()`) purely to satisfy the contract.
- The admin's second entry ("office") exists so a "set as default" demo has a target to move the flag onto.
- An order's `shippingAddress`/`billingAddress` is a *snapshot copy* of an entry, not a reference — sharing the literal would prevent the book from diverging, which is exactly the scenario this fixture set is meant to demonstrate.
- `shopModule` is consumed by `scenarios/shop-modules.generated.ts` (regenerated via `npm run regenerate`); deleting this file removes its entry from that table automatically.
