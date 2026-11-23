---
source: scenarios/addresses.ts
source_sha256: 7cc46db5eb727b086fb489be0d4935d042bd9da5b3dd7178afbf74b3c7959d14
context_sha256: 5b5b3caba5cfdbd622019d5159b7d1998e1d5153358b3360ae9e290fa1b42561
generated_at: 2026-11-22T01:41:31.595827+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/addresses.ts

## Purpose
Defines the address-book slice of the demo dataset and registers it as a seedable module. It gives the admin two entries (so "exactly one default" is observable), the ordinary customer one, and the second-shopper persona one. The ordinary customer's entry is the one that orders placed by the flow runner snapshot as `shippingAddress` and `billingAddress`, so "an order remembers where it was sent" can be checked against a book that may still change.

## Key elements
- `addressBookFixtures` (module-private): three address books built with `makeAddressBook`.
  - Admin (`SEED_ADMIN_ID`): "home" (Modena, default) and "office" (Bologna, non-default, the target for a "set as default" demo).
  - Ordinary customer (`SEED_USER_ID`): one "casa" entry (Napoli, default), with `phone` deliberately omitted to show an absent optional field.
  - Second shopper (`SEED_SECOND_SHOPPER_ID`): one "home" entry (Parma, default).
- `seedAddressBooksCollection()` (module-private): runs `insertIfAbsentForOwner(addressBookRepository, book)` for every fixture via `Promise.all`, returning `Promise<SeedOutcome[]>`.
- `shopModule` (exported): `{ seed: seedAddressBooksCollection }`, this module's entry in the `shop` fixture table.

## Relationships
- `scenarios/accounts.ts`: supplies the owner ids `SEED_ADMIN_ID`, `SEED_USER_ID` and `SEED_SECOND_SHOPPER_ID`.
- `scenarios/seed.ts`: supplies `insertIfAbsentForOwner` and the `SeedOutcome` type.
- `src/modules/addresses/factories.ts`: supplies `makeAddressBook`, which builds each fixture.
- `src/modules/addresses/repository.ts`: supplies `addressBookRepository`, the persistence target for seeding.
- `./shop-modules` and `seedShop` (per the comments, not among the listed neighbors): `shopModule` is collected into `shopModules` and run by `seedShop`.

## Notes
- The books have no pinned `_id`. `insertIfAbsentForOwner` keys on `userId`, so an id would add no idempotency.
- Each entry's `id` is minted fresh with `new Types.ObjectId().toHexString()`, because the contract requires one but nothing looks entries up by value. These ids therefore change on each module load.
- Orders restate a copy of an address rather than referencing the book's entry. The snapshot must be able to differ from the live book.
- Staff and admin personas do not shop, so only the ordinary customer and the second shopper have a checkout address. The second shopper exists for two-shopper journeys.
- Registration is generated. `npm run regenerate` regenerates the entry collected into `shopModules` (`./shop-modules`), so deleting this file removes its entry.
