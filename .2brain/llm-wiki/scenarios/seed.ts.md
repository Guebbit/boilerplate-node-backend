---
source: scenarios/seed.ts
sha256: 1529b8e19fa8e5b888b002f25beff3279cbd8cf6019f5d889558847027e50b9b
generated_at: 2026-10-14T07:01:16.825201+00:00
model: ollama:qwen3.8:27b
---

# scenarios/seed.ts

## Purpose

Domain-agnostic seeding primitive that every scenario module uses to write test fixtures into the database. It provides "insert-if-absent" semantics so fixtures are idempotent across runs without any coupling to a specific entity type.

## Key elements

- **`SeedOutcome`** (`'created' | 'skipped'`) — result type returned by every seeding call; the runner tallies these.
- **`SeedRepository<TFixture>`** — structural interface (`findById` + `create`). Any module repository that has these two methods satisfies it; the generic pins the fixture shape to the repository that stores it.
- **`OwnedSeedRepository<TFixture>`** — same idea but keyed by `findByUserId` instead of `findById`; for entities (carts, wishlists, addresses) that have no pinned `_id`.
- **`insertIfAbsent(repository, fixture)`** — checks for an existing row by the fixture's fixed `_id`; calls `create()` only if absent. Returns a `Promise<SeedOutcome>`.
- **`insertIfAbsentForOwner(repository, fixture)`** — same skip-if-present policy, but checks by `fixture.userId`. Intended for owner-scoped collections.
- **`insertIfAbsentBy`** (module-private) — shared helper both public functions delegate to; takes a `present()` predicate and a minimal `{ create }` object.

## Relationships

- **All scenario modules** (`addresses.ts`, `blank.ts`, `example.ts`, `locales.ts`, `products.ts`, `shop-modules.ts`, `users.ts`, `webhooks.ts`, `wishlist.ts`) — each exports a `seed` function that calls `insertIfAbsent` or `insertIfAbsentForOwner` with its own repository and fixture. This file is the sole write-path they use for fixture creation.
- **`scenarios/index.ts`** — re-exports the public API of this module alongside the individual scenario modules.
- **`tests/unit/scenarios/seed.test.ts`** — unit tests covering the insert/skip behavior and the owner-keyed variant.

## Notes

- Uses `create()` rather than `updateOne({ upsert: true })` deliberately: pre-save hooks (notably password hashing) still fire. A raw driver upsert would bypass them.
- **Never updates.** If a row already exists it is skipped, not repaired. Re-running seeding will not fix a database seeded from older fixture shapes — the name "insert" is intentional.
- The generic parameter on `SeedRepository` / `OwnedSeedRepository` exists to type-check the fixture against the repository at the call site, avoiding an `as never` cast that a `create: (data: never)` signature would force.
- `insertIfAbsent` requires `TFixture extends { _id: Types.ObjectId }`; `insertIfAbsentForOwner` requires `TFixture extends { userId: Types.ObjectId }`. Fixtures must carry the appropriate key.
