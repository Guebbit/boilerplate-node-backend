---
source: src/modules/account/tests/integration/persisted-locale.test.ts
sha256: 0a0f78de0cdfb007bb8e26d6e73daadac79ba47ad8785e7b20ba372281867f8e
generated_at: 2026-11-08T04:39:50.383449+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/persisted-locale.test.ts

## Purpose

Integration tests for the `locale` field persisted on the user document. They verify the full lifecycle: capture at signup from the incoming request's language, fallback to the boot locale when no request is present, post-signup editability, non-clobbering by unrelated partial updates, and exposure in the user's JSON contract.

## Key elements

- **`describe('a user's persisted locale')`** — five test cases covering the scenarios above.
- **Signup capture test** — wraps `accountService.signup` in `runWithLocale('it', …)` to simulate an `Accept-Language` header; asserts the stored `locale` equals `'it'`.
- **Boot-locale fallback test** — calls `accountService.signup` with no locale context; asserts the stored value equals `getDefaultLocale()`.
- **Editability test** — creates a user, then calls `userService.updateById(…, { locale: 'it' }, callerContextAs('admin'))`; asserts the new value sticks.
- **Partial-update isolation test** — sets `locale`, then updates `username` only; reloads via `userRepository.findById` and asserts `locale` is unchanged.
- **Client-exposure test** — after setting `locale`, asserts it is present on `user.toJSON()`.

## Relationships

- **`@infrastructure/i18n`** (`context.ts` / `index.ts`) — provides `runWithLocale` (simulates a per-request locale) and `getDefaultLocale` (boot-time fallback).
- **`@modules/account/services`** — the system under test: `accountService.signup` is where locale capture happens.
- **`@modules/users`** (index, model, repository, services) — `UserDocument` type, `userService.updateById`, and `userRepository.findById` exercise the read/write/update paths.
- **`@modules/users/tests/factories`** — `createUser` and `PLAIN_PASSWORD` supply fixture data; `userRepository` re-exported from here.
- **`tests/support/setup-test-db`** — `setupTestDb()` runs at module load, giving these tests a real database rather than mocks.
- **`tests/support/callers`** — `testCallerContext` and `callerContextAs('admin')` build the caller/permission context required by service calls.
- **`@infrastructure/http/response`** — `ResponseSuccess` type used to cast service results and access `.data`.

## Notes

- Tests are **integration-level**: `setupTestDb()` is called at the top, so every case hits a real database. No service mocks are involved.
- `runWithLocale` is used to *simulate* the request-scoped locale without spinning up an HTTP server; it is not a test for the HTTP layer itself.
- The "left alone" test specifically guards against a regression where a partial `updateById` call would reset `locale` to a default.
- The "reaches the client" test checks `toJSON()` serialization rather than an HTTP response body, so it validates the model contract, not a route.
