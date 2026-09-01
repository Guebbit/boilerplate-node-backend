# src/modules/users/demo.ts

## Purpose

Defines the users module's slice of the demo dataset: two seeded accounts (one admin, one customer) that other modules and routes reference during development. Provides the fixtures, the seed routine, and a read-back export used by the demo-dataset publishing script.

## Key elements

- **`userFixtures`** — Array of two user objects built via `makeUser` (`./fixtures`): `root` (admin, `verified: true`) and `ginopinoshow` (customer). IDs, emails, and passwords are pulled from `@kernel/seed-accounts` so other modules can reference the same identities.
- **`seedUsersCollection()`** — Upserts every entry in `userFixtures` through `userRepository` using `upsertById` from `@infrastructure/persistence/seed`. Declared in `module.ts`; invoked by `db/demo/index.ts`.
- **`exportSeededUsers()`** — Reads the seeded user collection back via `exportCollection(userModel, { _id: 1 })`. Returns only IDs; passwords are intentionally excluded and published separately from `@kernel/seed-accounts`.

## Relationships

- **`src/kernel/seed-accounts.ts`** — Source of the six `SEED_*` constants (IDs, emails, passwords). This file and other modules (cart, etc.) share these constants to reference the same two identities.
- **`src/modules/users/fixtures.ts`** — Supplies the `makeUser` factory that shapes each fixture object.
- **`src/modules/users/model.ts`** — Supplies `userModel`, used by `exportSeededUsers` to query the raw collection.
- **`src/modules/users/repository.ts`** — Supplies `userRepository`, the upsert target in `seedUsersCollection`.
- **`src/infrastructure/persistence/seed.ts`** — Provides the `upsertById`, `exportCollection` primitives and the `SeedOutcome` type.
- **`src/modules/users/module.ts`** — Registers/declares this module's seed function in the broader demo-orchestration flow.

## Notes

- `verified` is explicitly set to `true` on both fixtures, overriding the schema default of `false`. The default is correct for self-signup (unverified email) but wrong for seed accounts that must be immediately loggable.
- Passwords never appear in `exportSeededUsers` output. The projection is `{ _id: 1 }`. Credentials are published out-of-band by `scripts/export-demo-dataset.ts` reading directly from `@kernel/seed-accounts`.
- Cart-line fixtures for these two users live in `src/modules/cart/demo.ts`, not here.
