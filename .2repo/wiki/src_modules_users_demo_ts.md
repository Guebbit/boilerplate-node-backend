# src/modules/users/demo.ts

## Purpose

Holds the user module's slice of the demo/seed dataset: two pre-built accounts (one admin, one customer) used to populate the database for local development and to export a reference dataset. It exists so the user directory owns its own seed rows rather than reaching into shared fixtures.

## Key elements

- **`userFixtures`** (exported const) — Array of two user objects created via `makeUser`: a `root` admin and a `ginopinoshow` customer. Both have `verified: true` to bypass the email-verification flow in the demo.
- **`seedUsersCollection`** (exported function) — Upserts every fixture through `userRepository` using `upsertById`; returns `Promise<SeedOutcome[]>`. Called by `db/demo/index.ts` during demo seeding.
- **`exportSeededUsers`** (exported function) — Reads the `users` collection via `exportCollection` and returns a `Record<string, unknown[]>` shaped the same as the API response (passwords excluded by the model's `applyUserTransform`).

## Relationships

- **`src/kernel/seed-accounts.ts`** — Source of all six shared literals (ids, emails, passwords). This file consumes them so no other module hardcodes user credentials.
- **`src/modules/users/factory.ts`** — Provides `makeUser`, the constructor used to build each fixture object.
- **`src/modules/users/model.ts`** — Provides `userModel`, passed to `exportCollection` so the export respects the model's field projection/transforms.
- **`src/modules/users/repository.ts`** — Provides `userRepository`, the persistence handle used by `upsertById` during seeding.
- **`src/modules/users/module.ts`** — Declares `seedUsersCollection` in the module's seed contract; this file supplies the implementation.
- **`src/infrastructure/persistence/seed.ts`** — Provides `upsertById`, `SeedOutcome`, and `exportCollection`, the generic persistence primitives both seeding and export rely on.

## Notes

- Cart line items are intentionally **not** in this file. They were previously attached to each user object but were moved to `src/modules/cart/demo.ts` to avoid cross-module ownership of records.
- `verified` is explicitly set to `true` on both fixtures, overriding the schema default of `false`. This is deliberate: seed accounts exist to be logged into, not to trigger the verification UX.
- `seedUsersCollection` is declared in `module.ts` (the module's public surface) but *implemented* here; callers go through the module, not this file directly.
- Passwords never appear in `exportSeededUsers` output. That enforcement lives in the model's `applyUserTransform`, not in this file. Credentials for `scripts/export-demo-dataset.ts` are read separately from `@kernel/seed-accounts`.
