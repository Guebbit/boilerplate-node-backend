---
source: src/modules/account/tests/integration/persisted-locale.test.ts
sha256: 0a0f78de0cdfb007bb8e26d6e73daadac79ba47ad8785e7b20ba372281867f8e
generated_at: 2026-10-14T09:12:35.294420+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/persisted-locale.test.ts

## Purpose

Integration tests verifying that the `locale` field on the user document is correctly captured from the request context at signup, falls back to the boot locale when no request context exists, remains editable via subsequent updates, is not clobbered by unrelated partial updates, and is exposed through the user's JSON serialization. The field exists so that non-request code (e.g., worker-sent emails) can resolve a user's preferred language.

## Key elements

- **`describe('a user's persisted locale')`** — the single suite; all tests are top-level `it` blocks (no nested describes).
- **`setupTestDb()`** — called once at module scope; provisions a fresh test database for the whole file.
- **Signup capture test** — wraps `accountService.signup` in `runWithLocale('it', …)` and asserts `data.locale === 'it'`.
- **Fallback test** — calls `accountService.signup` *without* `runWithLocale` and asserts `data.locale` equals `getDefaultLocale()`.
- **Edit test** — creates a user via the `createUser` factory, then calls `userService.updateById` with `{ locale: 'it' }` and asserts the change.
- **Partial-update safety test** — sets locale, then updates only `username`; re-reads via `userRepository.findById` and asserts locale is still `'it'`.
- **Serialization test** — updates locale, re-reads the document, and asserts `toJSON()` includes the `locale` key.

## Relationships

- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, which the file calls at module load to initialise the in-memory/database test environment.
- **`tests/support/callers.ts`** — provides `testCallerContext` (used for signup) and `callerContextAs('admin')` (used for update calls).
- **`src/modules/users/tests/factories.ts`** — provides `createUser`, `PLAIN_PASSWORD`, and a re-exported `userRepository` used for direct DB reads.
- **`src/modules/account/services/index.ts`** — source of `accountService.signup`, the primary code under test.
- **`src/modules/users/index.ts`** / **`src/modules/users/services/index.ts`** — source of `userService.updateById` and the `UserDocument` type.
- **`src/modules/users/model.ts`** — defines the `UserDocument` shape (including `locale` and `toJSON`).
- **`src/infrastructure/i18n/index.ts`** → **`context.ts`** / **`catalog.ts`** — provides `runWithLocale` (simulates a request's `Accept-Language`) and `getDefaultLocale` (boot-time fallback).
- **`src/infrastructure/http/response.ts`** — source of the `ResponseSuccess<T>` type used in type-casts to access `.data`.

## Notes

- The file is side-effectful: `setupTestDb()` runs at import time, so the test runner must load this module before any assertions are meaningful.
- The two signup tests are intentionally asymmetric—one *inside* `runWithLocale` and one *outside*—to pin down both the happy path and the no-request fallback.
- The "left alone" test bypasses the service layer for its assertion (uses `userRepository.findById` directly) to confirm the write truly persisted rather than being an in-memory artifact.
- `PLAIN_PASSWORD` and `createUser` come from the same factories module; `PLAIN_PASSWORD` is the shared constant so both halves of the signup payload match without hardcoding.
