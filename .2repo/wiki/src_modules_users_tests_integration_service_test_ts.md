# src/modules/users/tests/integration/service.test.ts

## Purpose

Integration test suite for the user service (`src/modules/users/service.ts`), exercised against a real (in-memory) database. It validates the public service API — input validation, search/filter/pagination, single-user fetch, creation, and update — confirming both happy paths and boundary conditions (wrong types, soft-delete vs. active, i18n message integrity, password hashing).

## Key elements

- **`setupTestDb()`** (module-level) — initialises the test database before any test runs.
- **`describe('userService.validateData')`** — asserts field-level validation rules: required fields, type checks for `admin`/`active` booleans, `imageUrl` as a server-relative path (`uri-reference`), tolerance of undeclared keys (e.g. `id` in PUT bodies), and that error messages are translated strings, never raw i18n keys.
- **`describe('userService.search')`** — covers text/email/username filters, the `active` filter (distinct from soft-delete), pagination, and empty-collection meta.
- **`seedActiveAndDeleted()`** (local helper) — creates three users whose `active` and `deletedAt` values deliberately disagree, so a filter that conflates the two would fail.
- **`describe('userService.getById')`** — verifies a real Mongoose document is returned (has `.save`), and `undefined` for missing/absent IDs.
- **`describe('userService.create')`** — confirms the pre-save hook hashes the password and that the `admin` flag persists.
- **`describe('userService.updateById')`** — checks field updates, password re-hash on non-empty password, and that an empty-string password leaves the hash untouched. Uses `userRepository.findByIdWithCredentials` to read the stored hash directly.
- **`asStub<T>(…)`** — type-only cast helper used throughout assertions to access Mongoose document fields without widening the type to `any`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/users/service.ts` | Module under test; all `describe` blocks call its exports. |
| `src/modules/users/tests/factory.ts` | Supplies `createUser` (seeds a user via the repository) and the `PLAIN_PASSWORD` constant. |
| `src/modules/users/index.ts` | Re-exports `userRepository` (used in the password-change assertion) and the `UserDocument` type. |
| `src/modules/users/repository.ts` | `findByIdWithCredentials` is called to verify the stored hash after an update. |
| `src/modules/users/model.ts` | Implicitly exercised — assertions on `.save`, `toJSON` normalisation, and `CastError` behaviour depend on the Mongoose schema defined here. |
| `src/infrastructure/http/response.ts` | Type-only import of `ResponseSuccess` / `ResponseReject` for casting service return values. |
| `tests/support/setup-test-db.ts` | Provides `setupTestDb`, called once at module load to create/clean the in-memory DB. |
| `tests/support/caller-context.ts` | Provides `testCallerContext`, passed as the auth/caller parameter to `create` and `updateById`. |
| `tests/support/stub.ts` | Provides `asStub`, the assertion-side type cast used throughout. |

## Notes

- **`active` ≠ soft-delete.** The `seedActiveAndDeleted` helper is purpose-built so that `active: true` and `deletedAt != null` coexist on one record. Any future change that routes the `active` filter through `deletedAt` will be caught by the three filter tests.
- **i18n raw-key guard.** A historical bug let i18next return the key itself (e.g. `"users.field-email-invalid"`) to the client. The test asserts every `message` does *not* match `/^[a-z]+(?:\.[\da-z-]+)+$/` — a shape-based check that survives copy rewording.
- **`imageUrl` is `uri-reference`, not `uri`.** A server-relative path (`/uploads/…`) must pass validation; requiring an absolute URL would reject every avatar upload.
- **Non-strict body parsing.** Undeclared keys (e.g. `id` in a PUT payload) are silently ignored by `validateData`, not rejected. This is intentional for partial-update ergonomics.
- **Password verification pattern.** After `create` or `updateById`, the test compares the returned/stored hash against `PLAIN_PASSWORD` or the previous hash rather than re-hashing, because the hash includes a per-call salt.
