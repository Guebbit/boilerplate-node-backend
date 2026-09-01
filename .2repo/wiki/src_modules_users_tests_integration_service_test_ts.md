# src/modules/users/tests/integration/service.test.ts

## Purpose

Integration test suite for `userService` that exercises validation, search, `getById`, and the admin create/update/delete flows against an in-memory MongoDB spun up by `setupTestDb`. It exists to catch contract-level bugs (wrong status codes, leaked i18n keys, incorrect filter semantics) that unit tests on individual functions would miss.

## Key elements

- **`describe('userService.validateData')`** — Asserts return shape (array of `{ message, details }`), type-checking of `admin`/`active` flags, `uri-reference` (not `uri`) for `imageUrl`, tolerance of undeclared body keys (e.g. `id` on PUT), and that error messages are translated copy, never raw dotted i18n keys.
- **`describe('userService.search')`** — Covers text/email/username partial-match filters, `active` column filtering (explicitly independent of `deletedAt`), pagination (`page`/`pageSize`/`meta.totalPages`), and empty-collection meta.
- **`describe('userService.getById')`** — Verifies a live Mongoose document is returned (`.save` is a function), and `undefined` for missing/absent IDs.
- **`describe('userService.create')`** — Checks password hashing via pre-save hook, admin flag propagation, the no-password path (service fills a placeholder to satisfy Mongoose's `required: true`), and emission/non-emission of `USER_SETUP_REQUESTED` domain event based on `sendSetupEmail`.
- **`seedActiveAndDeleted()`** (local helper) — Creates three users whose `active` and `deletedAt` values deliberately disagree, so tests can prove the two facts are independent.

## Relationships

- **`src/modules/users/service.ts`** — The module under test; calls `validateData`, `search`, `getById`, `create`.
- **`src/modules/users/tests/fixtures.ts`** — Provides `createUser` (seed helper) and `PLAIN_PASSWORD` constant.
- **`src/modules/users/index.ts`** — Source of `userRepository` (used directly in the no-password test to inspect stored credentials) and the `USER_SETUP_REQUESTED` event constant.
- **`src/modules/users/repository.ts`** — Reached via `userRepository.findByIdWithCredentials` to assert the DB actually contains a non-empty password.
- **`src/kernel/events.ts`** — `onDomainEvent` subscribes to `USER_SETUP_REQUESTED`; `resetDomainEvents` clears subscriptions in `afterEach`.
- **`src/infrastructure/http/response.ts`** — Type imports (`ResponseSuccess`, `ResponseReject`) for typing test expectations.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory Mongo at module scope.
- **`tests/support/caller-context.ts`** — `testCallerContext` passed as the second argument to `userService.create`.
- **`tests/support/stub.ts`** — `asStub<T>` narrows test results for property assertions without full type knowledge.
- **`src/modules/users/model.ts`** — Referenced in comments; its Mongoose schema (`required: true` on password, `toJSON` transform) drives several assertions.

## Notes

- `setupTestDb()` runs once at **module level**, not in `beforeEach`; data accumulates across `it` blocks within a suite. Tests that assert exact counts (e.g. "length 2", "length 3") rely on the specific seed order within their own block.
- The `active` filter tests are intentionally adversarial: a deleted user is still `active: true` and a deactivated user is **not** deleted. This proves the service filters on the `active` column alone and does not silently apply a `deletedAt IS NULL` clause.
- The i18n assertion matches the *shape* of a raw key (`/^[a-z]+(?:\.[\da-z-]+)+$/`) rather than specific copy, so it survives copy rewrites.
- `resetDomainEvents()` appears only in the no-password `afterEach`; other suites that subscribe (if any further down in the truncated file) must clean up themselves.
- The file header mentions "update/delete flows" but the visible portion is truncated; those suites are expected further in the file.
