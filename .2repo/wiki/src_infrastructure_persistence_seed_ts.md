# src/infrastructure/persistence/seed.ts

## Purpose

Provides the generic seeding primitive that every module's `demo.ts` uses to upsert fixed-ID fixtures into a database. It lives in `infrastructure` because it is domain-agnostic: it only knows a repository shape and a fixture with a pinned `_id`, never a specific collection name. It also exposes a `toJSON`-based collection reader so the demo dataset can be exported in a deterministic, byte-stable form.

## Key elements

- **`SeedOutcome`** (`'created' | 'skipped'`) — Discriminates whether a fixture was newly written or already present; used by the seeder runner for reporting.
- **`SeedRepository<TFixture>`** — Structural interface (`findById` + `create`) that any module repository must satisfy. Generic over the fixture type so the fixture is checked against the repository that stores it (avoids a `never` parameter).
- **`SEED_SAVE_OPTIONS`** (`{ timestamps: false } as const`) — Passed to `create()` so Mongoose does not overwrite the fixture's pinned `createdAt` with the seeder's run time.
- **`upsertById<TFixture>`** — Checks `findById`; if the document exists, returns `'skipped'` (does **not** rewrite). Otherwise calls `create(fixture, SEED_SAVE_OPTIONS)` and returns `'created'`. Going through `create`/`save` ensures model pre-save hooks (e.g. bcrypt hashing) still run.
- **`exportCollection<TDocument>`** — Runs `model.find().sort(sort).exec()` then maps each document through `.toJSON()`. The sort key must be a total order so re-exports of unchanged data are byte-identical.

## Relationships

- **`src/modules/*/demo.ts`** (account, cart, locales, orders, products, users, wishlist) — Each module's demo file imports `upsertById` and `SEED_SAVE_OPTIONS` to seed its own fixtures through its own repository.
- **`src/infrastructure/persistence/base-repository.ts`** — The concrete base repository satisfies the `SeedRepository<TFixture>` structural interface, so module repositories inherit compatibility without an explicit `implements`.
- **`src/kernel/registry.ts`** — Depends on `exportCollection` (or the same `toJSON` + sort pattern) when reading collections back for the demo-dataset export; the serializer requirement is what makes `seed-conformance.test.ts` compare against the API's real shape rather than the raw fixtures.
- **`src/kernel/seed-accounts.ts`** — Provides account fixtures (pinned `_id` + `createdAt`) that are seeded through `upsertById`.
- **`tests/unit/infrastructure/persistence/seed.test.ts`** — Unit-tests `upsertById` (created/skipped paths) and `exportCollection` (serialization, sort order).

## Notes

- **Idempotent ≠ repairable.** An existing `_id` is skipped, not overwritten. Re-running the seeder will not fix a database that was seeded from an older fixture set; a migration is responsible for that.
- **`timestamps: false` is load-bearing.** The exported `db/demo/demo-data.json` is committed to the repo. If Mongoose wrote run-time timestamps, every export would produce a different file and the staleness check would never pass.
- **`create` over `updateOne({upsert:true})` is intentional.** A raw driver write would bypass Mongoose pre-save hooks, most critically the bcrypt password-hash hook.
- **`exportCollection` sort must be a total order.** A partial sort (e.g. only `_id` when documents share it) would make the JSON array order non-deterministic and break byte-identical re-exports.
- The `eslint-disable` on `.sort()` in `exportCollection` suppresses a false-positive from `unicorn/no-array-sort`; it is Mongoose's `Query#sort`, not `Array#sort`.
