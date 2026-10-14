---
source: src/modules/account/tests/integration/reset-request-timing.test.ts
sha256: 58b7bf5745db2321a927bf98b28c25acb8ab570e76ffa371d57a9b57342d22ba
generated_at: 2026-10-14T09:12:53.481412+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/reset-request-timing.test.ts

## Purpose

Integration tests that verify `POST /account/reset` returns `200` **immediately**, without waiting for the user-lookup (repository) call to settle. This guarantees no timing oracle leaks which email addresses are registered, and that any background failure is logged rather than surfaced to the caller.

## Key elements

- **`mockOutbox`** – module-level array that records every `enqueueEmail` call; used to assert the reset email is eventually sent.
- **`jest.mock('@infrastructure/adapters/mailer')`** – replaces `enqueueEmail` with a spy that pushes into `mockOutbox` and resolves instantly.
- **`describe('POST /account/reset timing')`** – three cases:
  - *known user, slow repo* – asserts `200` while `findByEmail` is still pending, then polls for the `account.reset-request` template in `mockOutbox`.
  - *unknown address, slow repo* – asserts the same immediate `200` (no behavioural difference from a known address).
  - *repo rejects* – asserts `200` still returned and `logger.error` called with the message `"A password reset request failed."`.
- **`released` flag pattern** – each slow-mock sets a boolean after its `setTimeout`; the test checks it is still `false` at response time to prove the endpoint did not `await` the lookup.

## Relationships

- **`tests/support/http.ts`** – `api()` provides the HTTP client used to `POST /account/reset`.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the test database before any test runs.
- **`tests/support/environment.ts`** – `setEnvironment` sets `NODE_MAIL_TRANSPORT: 'outbox'` in `beforeEach`.
- **`tests/support/eventually.ts`** – `eventually()` polls a condition until it becomes true (used for async outbox / log assertions).
- **`src/modules/users/index.ts`** – exports `userService`; the test spies on `userService.findByEmail`.
- **`src/modules/users/services/index.ts`** – the concrete service whose `findByEmail` is the slow/rejected dependency under test.
- **`src/modules/users/tests/factories.ts`** – `createUser` builds a seeded user for the known-address case.
- **`src/infrastructure/adapters/logger.ts`** – `logger.error` is spied on to assert failure is logged.

## Notes

- The mailer mock is module-level (`jest.mock`), while `findByEmail` and `logger.error` are per-test spies restored in `afterEach` via `jest.restoreAllMocks()`.
- The test does **not** assert response body content or timing thresholds in milliseconds; it relies on the 600 ms `setTimeout` being longer than the HTTP round-trip so the `released` flag is provably still `false` at assertion time.
- `mockOutbox` is cleared in `beforeEach`, not in `afterEach`, so a test never sees residue from a prior test.
