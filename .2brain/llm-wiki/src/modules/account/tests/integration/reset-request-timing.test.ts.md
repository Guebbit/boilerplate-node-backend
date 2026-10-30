---
source: src/modules/account/tests/integration/reset-request-timing.test.ts
sha256: e7c8f67a10b2c3ce6e5f05d46e2317282e8b27ca89b6119b4dfe7a9233e55b2e
generated_at: 2026-10-29T02:59:28.590172+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/reset-request-timing.test.ts

## Purpose

Integration test verifying that `POST /account/password/reset` responds immediately (204) without waiting for the background user-lookup or email-enqueue to complete, and that any failure occurring in that background work is logged rather than swallowed. This guards against user-enumeration timing leaks and ensures operational visibility of reset-request failures.

## Key elements

- **Module doc block** – states the invariant: the endpoint must answer at a constant time regardless of whether the address is registered, and must log (not throw) on internal failure.
- **`mockOutbox`** – module-level array that the mocked `enqueueEmail` pushes into; used to assert an email was eventually queued.
- **`jest.mock('@infrastructure/adapters/mailer', …)`** – replaces `enqueueEmail` with a spy that records the template and resolves immediately, while preserving the rest of the mailer module.
- **`setupTestDb()`** – initialises an in-memory/ephemeral database for the test run.
- **`beforeEach`** – sets `NODE_MAIL_TRANSPORT: 'outbox'` (so the app routes through the mocked mailer) and clears `mockOutbox`.
- **`afterEach`** – `jest.restoreAllMocks()` to undo spies on `userService` and `logger`.
- **Test 1 – "answers before a slow repository does"** – wraps `userService.findByEmail` in a 600 ms `setTimeout` for a real user; asserts 204 is returned *before* the delay resolves, then uses `eventually` to confirm the `account.reset-request` email was queued after the fact.
- **Test 2 – "answers an unknown address in the same breath"** – same 600 ms delay but `findByEmail` resolves to `undefined`; asserts 204 is returned before the delay elapses (no observable timing difference vs. test 1).
- **Test 3 – "logs a failure behind the answer"** – `findByEmail` rejects with an error; asserts the endpoint still returns 204 and that `logger.error` is called with the message `'A password reset request failed.'`.

## Relationships

- **`src/modules/users/index.ts`** – imports `userService`; tests spy on `userService.findByEmail` to simulate slow/failing lookups.
- **`src/modules/users/tests/factories.ts`** – imports `createUser` to seed a real user record in the test DB.
- **`src/infrastructure/adapters/logger.ts`** – imports `logger`; test 3 spies on `logger.error` to verify failure logging.
- **`tests/support/http.ts`** – provides `api()` helper for issuing real HTTP requests against the running app.
- **`tests/support/setup-test-db.ts`** – provides `setupTestDb()` to provision the test database.
- **`tests/support/environment.ts`** – provides `setEnvironment()` to set `NODE_MAIL_TRANSPORT` so the app uses the outbox (mocked) transport.
- **`tests/support/eventually.ts`** – provides `eventually()` for polling-async assertions (waiting on background side-effects without hard sleeps).

## Notes

- The tests deliberately introduce a 600 ms artificial delay on the repository call to *prove* the endpoint does not `await` it; the `released` flag is the observable signal.
- `NODE_MAIL_TRANSPORT: 'outbox'` is required so the production code path reaches the mocked `enqueueEmail`; without it the real transport would be attempted.
- The mailer mock uses `jest.requireActual` spread to keep all other mailer exports intact—only `enqueueEmail` is replaced.
- There is no `users/services/index.ts` import in this file; the service is reached through the barrel at `src/modules/users/index.ts`.
