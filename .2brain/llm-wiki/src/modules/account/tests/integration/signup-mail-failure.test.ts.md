---
source: src/modules/account/tests/integration/signup-mail-failure.test.ts
sha256: 64361123c40355b9859111d6276574c017360730c0b2120832c66a9e58a4b62b
generated_at: 2026-11-08T04:43:51.893580+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/signup-mail-failure.test.ts

## Purpose

Verifies that `POST /account/signup` returns **201** even when the verification email cannot be queued, and that the resulting `logger.error` call fires exactly once carrying the new account's `userId` and the original error. The file exists because a silent mail-queue failure is otherwise invisible except in logs, so the log payload must be correct and unambiguous.

## Key elements

- **`lostMailLines(spy)`** — helper that filters a `logger.error` spy's mock calls down to objects whose `message` equals `"Signup verification email could not be queued."`. Used to isolate the relevant line from other error calls (e.g. rate-limit setup warnings) that land on the same spy.
- **`describe("POST /account/signup when the verification mail cannot be queued")`** — single test that:
  - Mocks `accountService.sendVerificationEmail` to reject with a sentinel error.
  - Spies on `logger.error`.
  - Posts a valid signup body via `api()`.
  - Awaits the async log line with `eventually`.
  - Asserts `response.status === 201`.
  - Asserts the log payload is `[{ message, userId: created?.id, error: queueFailure }]` via `userRepository.findOne({ email })`.

## Relationships

- **`tests/support/http.ts`** — provides `api()` used to issue the HTTP POST.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initializes a clean test database before the suite runs.
- **`tests/support/eventually.ts`** — `eventually` polls until the fire-and-forget rejection has been handled and the log line appears.
- **`src/modules/users/tests/factories.ts`** — supplies `PLAIN_PASSWORD` for the request body and `userRepository` to look up the created row.
- **`src/modules/account/services/index.ts`** — exports `accountService`; the test mocks its `sendVerificationEmail` method.
- **`src/infrastructure/adapters/logger.ts`** — exports `logger`; the test spies on `logger.error` to capture and assert the payload.

## Notes

- The mail send is **fire-and-forget**: the rejection reaches the `.catch` handler asynchronously after the 201 has already been sent, so the test must use `eventually` rather than a plain `await` to observe the log call.
- `lostMailLines` exists because `logger.error` is a shared spy; other tests or setup code may emit unrelated error lines (the comment calls out rate-limit set-up warnings). Filtering by the exact `message` string keeps the assertion precise.
- `afterEach(() => jest.restoreAllMocks())` ensures the `sendVerificationEmail` and `logger.error` spies don't leak between test runs.
