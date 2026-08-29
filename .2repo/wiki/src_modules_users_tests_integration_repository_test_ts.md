# src/modules/users/tests/integration/repository.test.ts

## Purpose

Integration test suite for `userRepository`, exercising every public method (`create`, `findById`, `findOne`, `findAll`, `count`, `save`, `deleteOne`, `updateMany`, and the token helpers) against a real database. It verifies persistence-level contracts: default values, password hashing, lean-object return shapes, pagination options, filter semantics, and token-lifecycle behaviour.

## Key elements

- **`describe('userRepository', …)`** — top-level suite; one nested `describe` per repository method.
- **`create` tests** — assert a new Mongoose document is returned, password is hashed (not stored plain), and `admin` defaults to `false`.
- **`findById` / `findOne` tests** — happy-path retrieval plus `null` on miss.
- **`findAll` tests** — no-filter, `limit`, `skip` (cursor pagination), filter by field, and that results are **lean objects** (no `.save`).
- **`count` tests** — unfiltered total, filtered count, empty-collection zero.
- **`save` / `deleteOne` / `updateMany` tests** — in-memory mutation flush, permanent removal, and bulk `$set` with non-matching documents left untouched.
- **`tokenRemoveAll` test** — removes all tokens of a given `TokenType`, leaves others.
- **`tokenRemoveExpired` tests** — removes only expired entries; **rejects** (throws) when the underlying `updateMany().exec()` fails, rather than resolving with an HTTP-style status. The spy targets `Users.updateMany` (the Mongoose model static) with a query-object mock that exposes `.exec`.
- **Session-lookup tests (truncated)** — assert the two queries the session/JWT layer delegates to this repository (`findByIdWithCredentials` and a positional update) live here, not in `account/session/jwt.ts`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/users/index.ts` | Source of `userRepository`, `TokenType`, `UserDocument` (barrel re-exports). |
| `src/modules/users/model.ts` | Imported directly as `userModel` (aliased `Users`) to spy on the Mongoose static `updateMany` for the rejection test. The comment notes this is an intentional spec-reaching-into-module-internal pattern. |
| `src/modules/users/repository.ts` | System under test; all assertions call methods on `userRepository`. |
| `src/modules/users/tests/factory.ts` | Provides `makeUser` (in-memory object builder) and `createUser` (persists via the repository). |
| `tests/support/setup-test-db.ts` | `setupTestDb()` called once at module top to prepare the test database. |
| `tests/support/stub.ts` | `asStub` used to type-narrow a lean object when asserting absence of Mongoose methods. |
| `src/modules/users/factory.ts` | Indirect: `createUser` in the test factory likely wraps the domain factory to build a valid `Partial<UserDocument>`. |

## Notes

- **Direct model import**: `userModel` is imported from `@modules/users/model` rather than the barrel. The in-file comment justifies this: no sibling module needs the model, so it was removed from the barrel; a spec may still reach its own module's internals.
- **`asStub` on lean objects**: `findAll` returns plain JS; the test uses `asStub<{ save?: unknown }>(user).save` to assert `.save` is `undefined`, confirming lean mode.
- **Token-removal failure contract**: `tokenRemoveExpired` **rejects** on write failure. The comment explicitly states this replaced an old `{ status: 500, success: false }` resolution so the service layer (`adminTokenCleanup`) owns the HTTP-level decision. The spy must return a query-like object with `.exec`, not a bare rejected promise, because the repository calls `.exec()` internally.
- **`makeUser() as Partial<UserDocument>`**: The cast acknowledges the factory returns a plain object; the repository accepts a partial document.
- The file is truncated in the provided content; the session-lookup `describe` block is incomplete.
