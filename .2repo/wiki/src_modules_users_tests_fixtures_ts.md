# src/modules/users/tests/fixtures.ts

## Purpose

Database-backed user fixtures for tests. Wraps the plain-payload builder in `../fixtures` to insert real `UserDocument` records via `userRepository`, giving integration and contract tests a persisted user instead of an in-memory object.

## Key elements

- **`createUser(overrides?)`** — Inserts a user into the test database (via `userRepository.create`) and returns the resulting Mongoose `UserDocument`.
- **`createAdminUser(overrides?)`** — Convenience wrapper over `createUser` that pre-sets `admin: true`, a fixed email/username, then spreads caller overrides on top.
- **Re-exports** — `makeUser`, `PLAIN_PASSWORD`, and `UserOverrides` are forwarded from `../fixtures` so downstream test files have a single import point.

## Relationships

- **`src/modules/users/tests/fixtures.ts` (sibling)** — Source of the plain-payload `makeUser` builder, `PLAIN_PASSWORD`, and the `UserOverrides` type. This file adds the database-persistence layer on top.
- **`@modules/users`** — Provides `UserDocument` (type) and `userRepository` used by `createUser`.
- **Test consumers** — Contract and integration tests across `account`, `cart`, `delivery`, and `orders` modules (e.g. `api.contract.test.ts`, `service.test.ts`, `jwt.test.ts`, `stock.test.ts`, `cancel.test.ts`) import `createUser` / `createAdminUser` to seed a known user in the test database.

## Notes

- Passwords in fixtures are **plain text** (`PLAIN_PASSWORD`); hashing happens in the model on save. Authenticate in tests using the `PLAIN_PASSWORD` constant, not a hash.
- Fields that have schema defaults (timestamps, flags, etc.) are deliberately **left unset** in `makeUser` so `createUser` exercises the real Mongoose defaults rather than hard-coded values.
- This file was split out from `../fixtures` after two divergent `makeUser` implementations coexisted and caused confusion. Keep DB-touching fixtures here; keep pure payload construction in `../fixtures`.
