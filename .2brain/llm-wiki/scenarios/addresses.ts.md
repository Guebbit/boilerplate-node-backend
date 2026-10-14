---
source: scenarios/addresses.ts
sha256: 5ab911143640600cbc91a2cba01a3d804b38889381dc71032d78948c1a906c04
generated_at: 2026-10-14T06:55:12.934979+00:00
model: ollama:qwen3.8:27b
---

# scenarios/addresses.ts

## Purpose

Defines the seed fixtures for the address-book collection and the function that inserts them. Three persona-specific books are provided so that demo flows (default-address selection, order snapshotting, two-shopper journeys) have realistic, non-uniform data to operate against.

## Key elements

- **`addressBookFixtures`** (exported `const` array) — Three `makeAddressBook` results: admin (2 entries, one default), ordinary customer (1 entry, `phone` omitted), second shopper (1 entry, default). Entry IDs are minted via `new Types.ObjectId()` at module-evaluation time.
- **`seedAddressBooksCollection`** (exported function) — Maps each fixture through `insertIfAbsentForOwner(addressBookRepository, book)` and returns `Promise<SeedOutcome[]>`. Keyed on `userId` for idempotency.

## Relationships

- **`scenarios/accounts.ts`** — Source of the three persona IDs (`SEED_ADMIN_ID`, `SEED_USER_ID`, `SEED_SECOND_SHOPPER_ID`) that identify the book owners.
- **`scenarios/seed.ts`** — Provides the `SeedOutcome` type and the `insertIfAbsentForOwner` helper that makes the seed idempotent per owner.
- **`scenarios/shop-modules.ts`** — Registers `seedAddressBooksCollection` as one of the shop modules walked by `seedShop`.
- **`src/modules/addresses/factories.ts`** — Supplies `makeAddressBook`, the shape-constructor used to build each fixture.
- **`src/modules/addresses/repository.ts`** — Supplies `addressBookRepository`, the persistence interface passed to `insertIfAbsentForOwner`.

## Notes

- Idempotency is guaranteed by the `userId` unique column, not by a pinned book `_id`; entry-level IDs are fresh each run because no downstream lookup depends on them.
- The admin's two-entry book is intentional: it makes "exactly one default" and "move the default flag" observable in demos.
- The ordinary customer deliberately omits `phone` so the dataset exercises the optional-field path.
- No staff persona carries an address (staff do not shop); the second-shopper persona covers the "second buyer" role in two-shopper journeys.
