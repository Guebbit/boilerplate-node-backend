---
source: scenarios/seed.ts
source_sha256: 25e67aa4ef62f017ec77be705c96a518bb690c1df305abfe1937bdc21a78188e
context_sha256: f28a48b9d34e741b3e05d250201ecd5e12d1a9ee9763027152c915f30218baf6
generated_at: 2026-11-22T01:45:32.884645+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/seed.ts

## Purpose
The seeding primitive that every scenario module writes fixtures through. It defines a minimal, structural repository shape and two "insert if absent" helpers. It knows nothing about any specific domain.

## Key elements
- `SeedOutcome`: type `'created' | 'skipped'`. The runner counts these.
- `SeedRepository<TFixture>`: needs `findById(id)` and `create(data: TFixture)`. It is generic over the fixture, so the fixture is type-checked against the repository that stores it. The previous `create: (data: never)` design needed an `as never` cast.
- `OwnedSeedRepository<TFixture>`: needs `findByUserId(userId)` and `create(data: TFixture)`. It is for collections addressed by their owner.
- `insertIfAbsent(repository, fixture)`: for fixtures with a pinned `_id: Types.ObjectId`. It looks the row up by `_id` string and creates it only if missing.
- `insertIfAbsentForOwner(repository, fixture)`: the same policy for fixtures with a `userId: Types.ObjectId` and no pinned `_id`. Carts, wishlists and address books are the examples named in the source. It looks the row up by `userId`.
- `insertIfAbsentBy` (private): the shared implementation. It calls `present()`, returns `'skipped'` if a row exists, and otherwise calls `repository.create(fixture)` and returns `'created'`.

## Relationships
- The neighbor scenario modules (`addresses`, `users`, `products`, `wishlist`, `webhooks`, `locales`, etc.) are the intended consumers. The file's header says every scenario module writes fixtures through it, and their repositories only have to satisfy the structural interfaces. Owner-keyed collections such as addresses and wishlists would use `insertIfAbsentForOwner`.
- The runner counts the returned `SeedOutcome` values.
- `tests/unit/scenarios/seed.test.ts` is the unit test for this file.

## Notes
- The helpers never update. An existing row is skipped, so re-running does not repair a database seeded from older fixtures. This is why they are named "insert" rather than "upsert".
- Writes go through `create()`, not `updateOne(..., { upsert: true })`, so pre-save hooks still run. The main one is the password hash, which a raw driver write would skip.
- The existence check is a separate find followed by a create. The code has no atomicity handling between the two steps.
