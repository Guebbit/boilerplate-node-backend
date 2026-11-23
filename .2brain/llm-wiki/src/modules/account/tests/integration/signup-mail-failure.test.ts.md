---
source: src/modules/account/tests/integration/signup-mail-failure.test.ts
source_sha256: 64361123c40355b9859111d6276574c017360730c0b2120832c66a9e58a4b62b
context_sha256: c34b266bced43153a5e6b83f7a2768b6c75ce7a942f34e039d0f65ec619ec3d5
generated_at: 2026-11-22T04:02:19.081491+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/signup-mail-failure.test.ts

## Purpose
Integration test that checks signup still succeeds (HTTP 201) when the verification email cannot be queued, and that the failure is logged with enough detail to identify whose mail was lost. Since nobody but the log can be told about this failure, the log line must carry the new account's id.

## Key elements
- `setupTestDb()` is called at module level to set up the test database.
- `afterEach(() => jest.restoreAllMocks())` undoes the spies after each test.
- `lostMailLines(spy)` takes a `logger.error` spy and returns only the logged payloads that are objects with `message === 'Signup verification email could not be queued.'`.
- The single test, `POST /account/signup when the verification mail cannot be queued`:
  - Mocks `accountService.sendVerificationEmail` to reject with `Error('token store down')`.
  - Stubs `logger.error`.
  - Posts a valid signup body to `/account/signup`, using `PLAIN_PASSWORD` for both password fields.
  - Waits with `eventually` until a lost-mail line has been logged.
  - Asserts a 201 response.
  - Looks the user up by email through `userRepository.findOne`.
  - Asserts that exactly one lost-mail line was logged: `{ message, userId: created?.id, error: queueFailure }`.

## Relationships
- `src/modules/account/services/index.ts`: supplies `accountService`, whose `sendVerificationEmail` is spied on and forced to reject.
- `src/infrastructure/adapters/logger.ts`: supplies `logger`, whose `error` method is spied on and stubbed to capture the log payloads.
- `src/modules/users/tests/factories.ts`: supplies `PLAIN_PASSWORD` and `userRepository`. The repository is the one used to fetch the created user's id.
- `src/modules/users/repository.ts`: the user repository behind `userRepository`. The test does not import it directly.
- `tests/support/http.ts`: supplies `api()`, the HTTP client used to call the signup endpoint (imported as `@tests/http`).
- `tests/support/setup-test-db.ts`: supplies `setupTestDb` for database setup.
- `tests/support/eventually.ts`: supplies `eventually`, which polls until the asynchronous log line appears.

## Notes
- The mail is sent fire-and-forget, so the response can return before the rejection is handled. That is why the test polls with `eventually` before asserting.
- Other `logger.error` calls, such as rate-limit set-up warnings, share the same spy. `lostMailLines` filters them out so the exact-match assertion only counts the relevant line.
