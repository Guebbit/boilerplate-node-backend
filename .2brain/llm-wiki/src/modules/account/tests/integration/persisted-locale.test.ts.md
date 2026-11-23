---
source: src/modules/account/tests/integration/persisted-locale.test.ts
source_sha256: 0a0f78de0cdfb007bb8e26d6e73daadac79ba47ad8785e7b20ba372281867f8e
context_sha256: ee37b21245a598d284cedec87d569035dd15a7ee8bb6e9488185e3141bcde7f2
generated_at: 2026-11-22T03:58:27.146578+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/persisted-locale.test.ts

## Purpose
Integration tests for the `locale` field persisted on the user document. `Accept-Language` only says what language a request is in. Background work such as a worker sending an email at 3am has no request to read, so the user's stored `locale` supplies the language there. The tests cover both ways the field is set: captured at signup and edited afterwards. The field lives in `account` because signup, which captures it, is behind that module's routes.

## Key elements
- `setupTestDb()`: called at module level to provide the test database.
- `describe('a user's persisted locale')`, with five cases:
  - **Captured at signup:** `accountService.signup` run inside `runWithLocale('it', ...)` returns a user with `locale === 'it'`.
  - **Boot-locale fallback:** signup outside any request context yields `getDefaultLocale()`.
  - **Editable:** `userService.updateById(id, { locale: 'it' }, callerContextAs('admin'))` returns the updated locale.
  - **Untouched by other updates:** after setting `locale` to `'it'`, an update that changes only `username` leaves the reloaded user with `locale === 'it'`.
  - **Exposed to the client:** `toJSON()` on the reloaded user includes `locale`, since it is part of the User contract.

## Relationships
- **`src/modules/account/services/index.ts`**: exports `accountService`, whose `signup` is the path that captures the locale.
- **`src/modules/users/index.ts`**: exports `userService`, whose `updateById` changes or preserves `locale`, and the `UserDocument` type used to cast results.
- **`src/modules/users/tests/factories.ts`**: provides `createUser` and `PLAIN_PASSWORD` to seed users and supply a valid signup password. It also exports `userRepository`, which the tests use to reload the persisted document and check stored state.
- **`src/infrastructure/i18n/index.ts`**: provides `runWithLocale` (sets the ambient request locale) and `getDefaultLocale` (the boot-locale fallback).
- **`src/infrastructure/http/response.ts`**: provides the `ResponseSuccess` type used to cast service results.
- **`tests/support/setup-test-db.ts`**: provides `setupTestDb`.
- **`tests/support/callers.ts`**: provides `testCallerContext` (used for signup) and `callerContextAs` (used as `'admin'` for updates).

## Notes
- Service results are a `success`-flagged union, so the tests cast to `ResponseSuccess<UserDocument>` after checking, or without checking, `success`.
- Updates run as an `admin` caller.
- The tests use `'it'` as the non-default locale, and the fallback test compares against `getDefaultLocale()` rather than a hard-coded value.
