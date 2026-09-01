# src/infrastructure/persistence/fixtures.ts

## Purpose

Shared fixture-building primitives that every module's `fixtures.ts` would otherwise repeat: identity handling (`_id` + pinned timestamps), a derived overrides type, and small utilities for date/ID conversion and `undefined`-stripping. Exists so module-level factories stay thin and consistent.

## Key elements

- **`FactoryIdentity`** (interface) — the three optional identity fields (`id`, `createdAt`, `updatedAt`) every factory accepts.
- **`OverridesFor<TEntity>`** (type) — composes `FactoryIdentity` with `Partial<Omit<TEntity, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>` and a widened `deletedAt?: Date | string`. Derives from the contract entity, so a field renamed in `openapi.yaml` breaks stale call sites at `tsc` time.
- **`compact`** (function) — drops keys whose value is `undefined` so they don't shadow a Mongoose `default:` when a factory spreads overrides over its own defaults.
- **`toDate`** (function) — `Date | string | undefined` → `Date | undefined`; passes `undefined` through so `compact` can remove the key entirely.
- **`toObjectId`** (function) — `undefined` → fresh `Types.ObjectId`; a string → pinned `Types.ObjectId`.
- **`identityOf`** (function) — builds `{ _id, createdAt, updatedAt }` from a `FactoryIdentity`. An omitted `createdAt` is read off the ObjectId's embedded timestamp; an omitted `updatedAt` mirrors `createdAt`.

## Relationships

- **`src/modules/{account,cart,locales,orders,products,users,wishlist}/fixtures.ts`** — each imports the utilities above (`compact`, `toDate`, `toObjectId`, `identityOf`, `OverridesFor`, `FactoryIdentity`) to construct their module-specific factories without re-implementing identity logic.
- **`tests/unit/infrastructure/persistence/fixtures.test.ts`** — unit-tests the exported utilities in this file.

## Notes

- `ObjectId.getTimestamp()` is **second-granular**: fixtures minted in the same tick share an identical `createdAt`. Tests that sort or paginate by `createdAt` must pass explicit dates.
- Timestamps are **pinned** (derived from the ObjectId or the caller), not set to "now." This keeps the seed export stable across re-runs.
- The module deliberately does **not** guarantee `createdAt ≤ updatedAt` or any ordering; a test that needs a specific ordering supplies the dates itself.
- `deletedAt` is widened to `Date | string` because the wire contract carries ISO strings while Mongoose stores `Date` objects; pairing with `compact` ensures the field is either present or absent, never present-and-`undefined`.
