# src/infrastructure/persistence/seed.ts

## Purpose

Provides the domain-agnostic seeding primitives (upsert-by-id, upsert-by-owner, collection export) that every module's `demo.ts` calls to load or skip its fixture data. It lives in `infrastructure` because it knows nothing about any specific domain—it only sees a structural repository shape and a fixture with a fixed identifier.

## Key elements

- **`SeedOutcome`** – Union type `'created' | 'skipped'` returned by every upsert so a runner can count what was actually written.
- **`SeedRepository<TFixture>`** – Structural interface (`findById` + `create`) that any module repository must satisfy to be seedable by `_id`.
- **`OwnedSeedRepository<TFixture>`** – Same shape but keyed on `findByUserId`; used for collections (carts, wishlists, address books) that have no pinned `_id`.
- **`SEED_SAVE_OPTIONS`** – `{ timestamps: false }` passed to every `create()` call so Mongoose doesn't clobber the fixture's baked-in `createdAt`.
- **`upsertById<TFixture>(repository, fixture)`** – Checks `findById(fixture._id)`; returns `'skipped'` if present, otherwise calls `create()` and returns `'created'`.
- **`upsertByOwner<TFixture>(repository, fixture)`** – Same skip-if-present logic but keys on `fixture.userId` via `findByUserId`.
- **`exportCollection<TDocument>(model, sort)`** – Reads a full collection with a deterministic sort, then maps each document through `.toJSON()` so the result matches the API's serialization.

## Relationships

- **`src/kernel/registry.ts`** – The registry's conformance check depends on `exportCollection` to read data back through the model's real serializer (`toJSON()`), ensuring fixtures are compared against the API view rather than themselves.
- **`src/modules/*/demo.ts`** (account, cart, locales, orders, products, users, wishlist) – Each module's demo file calls `upsertById` or `upsertByOwner` with its own repository and fixtures to populate (or skip) its collection during seeding.
- **`tests/unit/infrastructure/persistence/seed.test.ts`** – Unit-tests the upsert and export functions in this file.

## Notes

- Existing documents are **skipped, never rewritten**. Re-running the seeder will not repair a database seeded from older fixtures; a fresh seed is required for that.
- Writes go through `create()` (Mongoose `save()`) rather than a raw `updateOne`/`insertOne`, so pre-save hooks—most notably the bcrypt password hash on user fixtures—still execute.
- `SEED_SAVE_OPTIONS` is mandatory: without `timestamps: false`, Mongoose overwrites the fixture's `createdAt` with the seeder's run time, making every export of `db/demo/demo-data.json` differ and its staleness check fail.
- `exportCollection` must be given a total-order `sort` so a re-export of unchanged data is byte-identical (deterministic diffing).
