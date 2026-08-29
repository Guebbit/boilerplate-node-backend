# src/modules/users/tests/factory.ts

## Purpose

Test-only persistence layer for user fixtures. It wraps the pure `makeUser` builder (defined one level up in `src/modules/users/factory.ts`) with a database write, so tests across the codebase can create real user documents without duplicating defaults. The split between builder and persister is deliberate: previously two separate `makeUser` functions with diverging defaults caused confusion; now there is one canonical source for the payload and one for the insert.

## Key elements

- **`createUser(overrides?)`** — Calls `userRepository.create(makeUser(overrides))` and returns the resulting `UserDocument`. The single entry point for inserting a non-admin user in tests.
- **`createAdminUser(overrides?)`** — Convenience wrapper around `createUser` that pre-sets `admin: true`, `email: 'admin@example.com'`, and `username: 'adminuser'`. Caller-supplied `overrides` spread last, so they can still override these defaults.
- **Re-exports from `../factory`** — `makeUser`, `PLAIN_PASSWORD`, and the `UserOverrides` type are re-exported so a test that imports "the user factory" from this path gets the builder, the password constant, and the type in one place.

## Relationships

- **`@modules/users`** — Imports the `UserDocument` type and the `userRepository` instance used for the insert.
- **`../factory` (`src/modules/users/factory.ts`)** — Source of `makeUser`, `PLAIN_PASSWORD`, and `UserOverrides`; this file delegates payload construction entirely to it.
- **Downstream test files** (account, cart, delivery, orders contract/integration tests) — All listed graph neighbors are test suites that import `createUser` / `createAdminUser` (and sometimes `PLAIN_PASSWORD`) to seed the test database before exercising their respective modules.

## Notes

- **Passwords are always plain text.** The Mongoose model's `pre('save')` hook performs hashing, so callers must pass an unhashed string. Use the exported `PLAIN_PASSWORD` constant for authentication lookups rather than retyping the literal.
- **Schema-defaulted fields are intentionally omitted.** `admin`, `active`, `verified`, `locale`, and `tokens` are left unset by `makeUser` so the real schema default is exercised. Override explicitly in a test if a specific value is required.
- **`active` and `deletedAt` are independent booleans**, meaning all four combinations (active/deleted, active/not-deleted, inactive/deleted, inactive/not-deleted) are constructible via overrides.
- **Do not import `makeUser` directly for DB writes.** It returns a plain object with no document methods; use `createUser` / `createAdminUser` when a persisted `UserDocument` is needed.
