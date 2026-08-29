# src/modules/account/demo.ts

## Purpose

Defines the demo dataset for the address-book collection and the seed/export functions the persistence layer calls to populate and read back those fixtures. Without this file the seeder skips the collection entirely (a module that declares no `seeds` is silently omitted), leaving `/account/addresses` empty and the checkout address step with nothing to select.

## Key elements

- **`addressBookFixtures`** — Array of two `AddressBook` objects built via `makeAddressBook`: one for the admin (2 entries: `home` default + `office`) and one for the regular customer (1 entry: `casa`, phone omitted to exercise the optional-field contract).
- **`upsertByOwner`** *(internal)* — Looks up an existing book by `userId`; returns `'skipped'` if found, otherwise calls `addressBookRepository.create` and returns `'created'`.
- **`seedAddressBooksCollection`** — Public entry point. Maps `addressBookFixtures` through `upsertByOwner` and returns `Promise<SeedOutcome[]>`. Declared in `module.ts`; invoked by `db/demo/index.ts`.
- **`exportSeededAddressBooks`** — Reads the stored rows back via `exportCollection(addressBookModel, …)` and returns them as `{ addressBooks: [...] }`. Intended for frontend mocks that build the `GET /account/addresses` response by reading `items` directly.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/seed-accounts.ts` | Imports `SEED_ADMIN_ID` and `SEED_USER_ID` to tie fixtures to known seed accounts. |
| `src/infrastructure/persistence/seed.ts` | Imports `SEED_SAVE_OPTIONS`, the `SeedOutcome` type, and `exportCollection` for write/save options and the read-back helper. |
| `src/modules/account/factory.ts` | Imports `makeAddressBook` to construct the fixture objects. |
| `src/modules/account/model.ts` | Imports `addressBookModel`; passed to `exportCollection` in the export function. |
| `src/modules/account/repository.ts` | Imports `addressBookRepository`; used for `findByUserId` and `create` in the upsert path. |
| `src/modules/account/module.ts` | Declares `seedAddressBooksCollection` as this module's seed entry (the seeder walks module manifests). |

## Notes

- **Upsert key is `userId`, not `_id`.** Fixtures pin a `_id`, but the skip-if-present check queries by `userId` (the unique column all address queries use). Re-running the seeder therefore idempotently skips by owner.
- **Admin has exactly two entries by design.** "Exactly one default" is only observable with ≥ 2; the second entry is what a "make this the default" demo interacts with. The customer has one to cover the single-address checkout path.
- **No zero-address fixture.** Absence and an empty book are indistinguishable in the API (`addressesGet` returns `[]` for both), and every fresh signup starts in that state, so no fixture is needed.
- **`orders/demo.ts` restates the admin's `home` entry** as a frozen `shippingAddress` on a seeded order rather than importing it. That duplication is intentional: an order's address is a snapshot that must be able to diverge from the live book.
- **Export shape ≠ API shape.** `exportSeededAddressBooks` returns the raw stored row (entries serialize as `Address` via the shared `addressItemSchema`). The `GET /account/addresses` response is a different view built by `./services/addresses`; a frontend mock should read `items` from the export, not expect the endpoint wrapper here.
