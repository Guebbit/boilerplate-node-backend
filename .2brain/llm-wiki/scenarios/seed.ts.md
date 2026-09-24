---
source: scenarios/seed.ts
sha256: b7dcfbb35bc4178f5d68860e7116737be711efa25bdd371a9871d578af7a8266
generated_at: 2026-09-23T17:19:51.120234+00:00
model: ollama:qwen3.8:27b
---

# scenarios/seed.ts

## Purpose

A domain-agnostic seeding primitive that all scenario modules use to write their fixtures. It provides a minimal repository interface and two "insert if not already present" helpers so that scenario modules never duplicate the check-then-create logic.

## Key elements

- **`SeedOutcome`** — `'created' | 'skipped'` union type returned by both insert helpers; the runner counts these.
- **`SeedRepository<TFixture>`** — structural interface requiring `findById` and `create`; any module repository satisfies it by shape.
- **`OwnedSeedRepository<TFixture>`** — same idea but keyed by `findByUserId` instead of `findById`, for collections (carts, wishlists, addresses) that have no pinned `_id`.
- **`insertIfAbsent(repository, fixture)`** — checks `findById(fixture._id)`; if absent, calls `create(fixture)`. Returns the `SeedOutcome`.
- **`insertIfAbsentForOwner(repository, fixture)`** — same policy but checks `findByUserId(fixture.userId)`.
- **`insertIfAbsentBy`** (internal) — shared implementation both public helpers delegate to.

## Relationships

- **Imported by every scenario module** (`addresses`, `blank`, `locales`, `products`, `users`, `webhooks`, `wishlist`) to write their fixtures through the two public helpers.
- **`scenarios/index.ts`** re-exports or orchestrates the scenario modules that depend on this file.
- **`tests/unit/scenarios/seed.test.ts`** unit-tests the insert/skip logic directly against this module.

## Notes

- Uses `create()` (model-level) deliberately, **not** `updateOne({ upsert: true })`, so Mongoose pre-save hooks (e.g. bcrypt hashing) still fire.
- **Insert-only, never update.** A fixture already in the DB is skipped, not repaired. Re-running seeds against a DB populated from older fixture versions will not fix drifted data — the name is "insert," not "upsert," for this reason.
- The generic is constrained to `{ _id: Types.ObjectId }` or `{ userId: Types.ObjectId }` respectively, so the compiler checks the fixture shape against the repository at the call site (avoids the old `as never` cast).
- `present()` is called via `Promise.resolve(...).then(...)` — it supports both sync and async return types from the repository.
