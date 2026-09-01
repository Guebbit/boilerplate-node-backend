# src/modules/account/demo.ts

## Purpose
Provides the address-book slice of the demo dataset. It defines two seeded address books (admin with two entries, ordinary customer with one), a seeding function, and a read-back export. It exists so that demo scenarios like "exactly one default entry per book" and "an order's shipping address is a snapshot that can diverge from the live book" are observable against real data.

## Key elements
- **`addressBookFixtures`** — Array of two `AddressBook` objects built via `makeAddressBook`. The admin's book has two items (one default, one non-default) to exercise the "set as default" demo; the customer's book has a single item and deliberately omits the optional `phone` field.
- **`seedAddressBooksCollection()`** — Upserts each fixture into the collection keyed by `userId` (the unique/owner column) rather than the pinned `_id`. Returns `SeedOutcome[]`.
- **`exportSeededAddressBooks()`** — Reads all seeded books back from the model sorted by `userId` and returns them under the key `addressBooks`. Intended for the frontend mock to consume directly.

## Relationships
- **`src/kernel/seed-accounts.ts`** — Supplies `SEED_ADMIN_ID` and `SEED_USER_ID` used as the `userId` on each fixture.
- **`src/infrastructure/persistence/seed.ts`** — Provides the `SeedOutcome` type, `exportCollection`, and `upsertByOwner` helpers used by the seed and export functions.
- **`src/modules/account/fixtures.ts`** — Provides `makeAddressBook`, the factory that shapes raw input into the fixture objects.
- **`src/modules/account/model.ts`** — Provides `addressBookModel` (the Mongoose model) passed to `exportCollection`.
- **`src/modules/account/repository.ts`** — Provides `addressBookRepository`, the repository handle passed to `upsertByOwner`.
- **`src/modules/account/module.ts`** — Declares `seedAddressBooksCollection` as part of the module's seed contract; the actual call originates from `db/demo/index.ts`.

## Notes
- Seeding is keyed on `userId` (the unique owner column) even though each fixture also pins an `_id`. This mirrors how every runtime query reaches a book.
- `orders/demo.ts` deliberately **restates** (does not import) a copy of the admin's default entry as an order's `shippingAddress`. This keeps the order's snapshot independent of the live book so the two can diverge—a property the fixture set is designed to make checkable.
- The customer's single entry omits `phone` entirely (not set to `''`) so the dataset demonstrates what an absent optional field looks like to a client.
- `exportSeededAddressBooks` is a read-only helper for the frontend mock; no API endpoint serves a raw address book. Stored items already serialize to the contract's `Address` shape via `addressItemSchema`'s shared serializer.
