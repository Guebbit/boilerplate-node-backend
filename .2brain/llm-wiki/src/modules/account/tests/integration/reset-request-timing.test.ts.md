---
source: src/modules/account/tests/integration/reset-request-timing.test.ts
source_sha256: 4b4af5a590517c0db1694b52c879799dc52722a818822b3ba5b070be224676b4
context_sha256: a7e8f97b4f38fd379de493a20759fdafaf7ffb2737b169bbf79627f380be309d
generated_at: 2026-11-22T03:59:34.280575+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/reset-request-timing.test.ts

## Purpose
Integration test for `POST /account/password/reset`. It verifies that the endpoint responds with 204 immediately, regardless of how slow the user lookup behind it is. This keeps the response time from revealing whether an address is registered. It also verifies that a failure in the background work is logged rather than swallowed.

## Key elements
- `mockOutbox`: array that records the template name of every mail queued through the mocked `enqueueEmail`.
- `jest.mock('@infrastructure/adapters/mailer', ...)`: keeps the real module exports but replaces `enqueueEmail` with a mock that pushes `{ template }` into `mockOutbox`.
- `setupTestDb()`: sets up the test database.
- `beforeEach`: sets `NODE_MAIL_TRANSPORT` to `'outbox'` and clears `mockOutbox`.
- `afterEach`: calls `jest.restoreAllMocks()`.
- Test 1, slow repository, registered user:
  - `accountUserService.findByEmail` is spied on and delayed by 600 ms, then delegates to the real lookup.
  - Asserts a 204 response and that the delay has not yet elapsed (`released === false`).
  - Then uses `eventually` to wait for an `account.reset-request` mail in the outbox.
- Test 2, slow repository, unknown address: `findByEmail` resolves `undefined` after 600 ms. Asserts a 204 response arrives before the delay elapses.
- Test 3, failing repository: `findByEmail` rejects with `'database is gone'` and `logger.error` is spied on. Asserts a 204 response and that `logger.error` was called with a message of `'A password reset request failed.'`.

## Relationships
- `@tests/http` (`api()`): sends the HTTP requests to the app.
- `@tests/setup-test-db` (`setupTestDb`): provides the database lifecycle.
- `@tests/environment` (`setEnvironment`): sets the mail transport env var.
- `@tests/eventually` (`eventually`): polls until the background mail or log call has happened.
- `@modules/users/tests/factories` (`createUser`): creates the registered user for test 1.
- `@modules/users/friends/account` (`accountUserService`): the lookup service whose `findByEmail` is spied on and delayed or failed.
- `@infrastructure/adapters/logger` (`logger`): its `error` method is spied on to check that failures are logged.

## Notes
- The tests rely on a real 600 ms delay and on `released` staying `false` when the response arrives. They check that the handler does not await the lookup.
- The mailer mock is hoisted by `jest.mock`, so it applies to the whole file and the outbox is shared. It is cleared before each test.
- In test 3 the `logger.error` mock returns `logger` so it can be chained.
