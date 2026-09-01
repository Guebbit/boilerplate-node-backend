# src/modules/account/tests/integration/persisted-locale.test.ts

## Purpose

Integration tests for the `locale` field persisted on the user document. The field captures the request locale at signup so background jobs (e.g. 3 a.m. email workers) have a stable language to use when no `Accept-Language` header is available. The tests verify capture-at-signup, fallback outside a request, post-signup mutability, non-interference from unrelated updates, and visibility in the client-facing user payload.

## Key elements

- **`describe('a user's persisted locale', …)`** — single suite containing five test cases:
  - *captured from the request they signed up in* — calls `accountService.signup` inside `runWithLocale('it', …)` and asserts the stored locale is `'it'`.
  - *falls back to the boot locale outside a request* — calls `accountService.signup` without a locale context and asserts the stored locale equals `getDefaultLocale()`.
  - *is editable afterwards* — creates a user via the `createUser` fixture, then updates via `userService.updateById` and asserts the new locale.
  - *is left alone by an update that does not mention it* — updates `username` only and re-reads from `userRepository.findById` to confirm locale is unchanged.
  - *reaches the client, since it is part of the User contract* — confirms `toJSON()` on the reloaded document includes `locale`.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope before the suite to provision a test database.
- **`tests/support/caller-context.ts`** — `testCallerContext` is passed as the caller-argument to every service call.
- **`src/modules/users/tests/fixtures.ts`** — `createUser` provides a pre-populated user document for the post-signup tests.
- **`src/modules/account/services/index.ts`** — `accountService.signup` is the system-under-test for the first two cases.
- **`src/modules/users/index.ts`** — re-exports `userRepository`, `userService`, and the `UserDocument` type used throughout.
- **`src/infrastructure/i18n/index.ts`** — `runWithLocale` simulates a request locale; `getDefaultLocale` supplies the expected fallback.
- **`src/infrastructure/http/response.ts`** — `ResponseSuccess` is imported as a type to narrow the service's union return before reading `.data.locale`.

## Notes

- `setupTestDb()` runs once at import time, not in `beforeEach`; the suite assumes a single fresh database per file.
- `accountService.signup` takes seven positional parameters (three of which are `undefined` placeholders); adding a parameter upstream will shift the `testCallerContext` position and break the test silently.
- The suite lives under `account/tests/` rather than `users/tests/` because the capture logic sits behind account's signup route, even though the field is owned by the user document.
- The `toJSON` assertion in the last test guards against a future regression where `locale` is accidentally excluded from the public user projection.
