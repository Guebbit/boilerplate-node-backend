---
source: scenarios/seed.ts
sha256: 1529b8e19fa8e5b888b002f25beff3279cbd8cf6019f5d889558847027e50b9b
generated_at: 2026-11-08T02:31:51.086031+00:00
model: ollama:qwen3.8:27b
---

# scenarios/seed.ts

## Purpose

Provides the generic "insert one fixture if it isn't already there" primitive that every scenario module uses to write seed data. It is domain-agnostic: it only knows a repository shape and a fixture with a stable key, so any module's repository satisfies it without importing domain code.

## Key elements

- **`SeedOutcome`** — Union type `'created' | 'skipped'`; the runner counts these to report seed activity.
- **`SeedRepository<TFixture>`** — Structural interface requiring `findById(id)` and `create(data)`. Any module repository with these two methods is assignable.
- **`OwnedSeedRepository<TFixture>`** — Same shape but keyed by `findByUserId(userId)` instead of `findById`. Used for fixtures (carts, wishlists, address books) that have no pinned `_id`.
- **`insertIfAbsent<TFixture extends { _id: Types.ObjectId }>`** — Checks `findById(fixture._id)`; if absent, calls `create(fixture)`. Returns the `SeedOutcome`.
- **`insertIfAbsentForOwner<TFixture extends { userId: Types.ObjectId }>`** — Same skip-if-present logic but checks `findByUserId(fixture.userId)` first.
- **`insertIfAbsentBy`** *(module-private)* — Shared implementation that both public functions delegate to: `present() → existing ? 'skipped' : create(fixture) → 'created'`.

## Relationships

- **scenarios/index.ts** — Re-exports `insertIfAbsent`, `insertIfAbsentForOwner`, and the repository interfaces so scenario authors import from a single entry point.
- **scenarios/users.ts, scenarios/products.ts, scenarios/addresses.ts, scenarios/wishlist.ts, scenarios/shop-modules.ts, scenarios/webhooks.ts, scenarios/locales.ts, scenarios/blank.ts, scenarios/example.ts, scenarios/shop.scenario.ts** — Each module's `seed` function calls `insertIfAbsent` or `insertIfAbsentForOwner` passing its own repository and fixture documents.
- **tests/unit/scenarios/seed.test.ts** — Unit-tests the two public insert functions (created/skipped paths, hook execution, owner-keyed variant).

## Notes

- **Insert, never upsert.** An existing row is always *skipped*, never rewritten. Re-running seeds does not repair data written by older fixture versions. The name "insert" is intentional to make this contract obvious to callers.
- **`create()` over raw driver writes.** The code deliberately calls the repository's `create()` (which goes through Mongoose `save()`) so that pre-save hooks — e.g. the password-hash hook in the users repository — still execute. A bare `insertOne`/`updateOne({ upsert: true })` would bypass them.
- **Structural, not nominal, repository typing.** `SeedRepository` and `OwnedSeedRepository` are generic over `TFixture` and structurally typed, so any repository with the right method signatures satisfies them without extending a base class.
- **Two keying strategies.** Fixtures with a pinned `_id` use `insertIfAbsent`; fixtures identified only by ownership (one-per-user carts, wishlists, address books) use `insertIfAbsentForOwner`. The split exists because the latter group has no stable `_id` to check against.
