---
source: src/modules/account/tests/integration/signup-mail-failure.test.ts
sha256: 64361123c40355b9859111d6276574c017360730c0b2120832c66a9e58a4b62b
generated_at: 2026-10-29T03:01:58.593525+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/signup-mail-failure.test.ts

## Purpose

Integration test that proves `POST /account/signup` still returns **201** when the verification email fails to queue (e.g. token store is down), and that the resulting `logger.error` line includes the new account's `userId` so operators can identify whose mail was lost.

## Key elements

- **`lostMailLines(spy)`** — pure helper that filters a `logger.error` spy's call history down to entries whose `message` equals `"Signup verification email could not be queued."`. Used to isolate the relevant log line from unrelated `error` calls (e.g. rate-limit warnings) on the same spy.
- **`describe('POST /account/signup when the verification mail cannot be queued')`** — single test that:
  1. Mocks `accountService.sendVerificationEmail` to reject with a sentinel `Error('token store down')`.
  2. Spies on `logger.error`.
  3. Sends a valid signup payload via the HTTP helper.
  4. Polls with `eventually()` until the rejection reaches the error handler.
  5. Asserts `201` status and that exactly one matching log line contains `{ message, userId, error }`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/http.ts` | `api()` provides the supertest-style client for the `POST /account/signup` request. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises an isolated database before the test runs. |
| `tests/support/eventually.ts` | `eventually()` polls until the fire-and-forget email rejection has been logged. |
| `src/infrastructure/adapters/logger.ts` | Spies on `logger.error` to capture and inspect the log payload. |
| `src/modules/account/services/index.ts` | Imports `accountService`; the test spies on its `sendVerificationEmail` method to inject the failure. |
| `src/modules/users/tests/factories.ts` | Supplies `PLAIN_PASSWORD` for the request body and `userRepository` to re-fetch the created row. |
| `src/modules/users/repository.ts` | `userRepository.findOne({ email })` retrieves the persisted account to extract its `id` for the log assertion. |

## Notes

- The email send is intentionally **fire-and-forget** inside the signup flow; the rejection is handled asynchronously *after* the HTTP response is sent, which is why the test must use `eventually()` rather than asserting synchronously.
- `lostMailLines` filters by exact message string because other code paths (rate-limiting setup) also call `logger.error` during the same request, all landing on the same spy.
- `afterEach` calls `jest.restoreAllMocks()`; the test relies on this to clean up both the `accountService` and `logger` spies.
- The `error` field in the expected log payload is the **same `Error` instance** (`queueFailure`), not a serialised copy — the assertion uses `toStrictEqual` which compares by reference for the `error` property.
