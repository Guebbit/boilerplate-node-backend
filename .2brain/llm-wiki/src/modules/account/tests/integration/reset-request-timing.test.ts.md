---
source: src/modules/account/tests/integration/reset-request-timing.test.ts
sha256: 4b4af5a590517c0db1694b52c879799dc52722a818822b3ba5b070be224676b4
generated_at: 2026-11-14T19:07:59.808950+00:00
model: ollama:qwen3.8:27b
---

# src/modules/password/reset-request-timing.test.ts

## Purpose

Verifies that `POST /account/password/reset` returns **204 immediately** — before the underlying email lookup, token write, and mail enqueue have completed — so response timing cannot be used to enumerate registered addresses. Also confirms that a repository failure is logged (not swallowed) while still producing a 204.

## Key elements

- **`mockOutbox`** – module-level array that the mailer mock pushes into; used to assert that a reset-request email was eventually queued.
- **`jest.mock('@infrastructure/adapters/mailer')`** – replaces `enqueueEmail` with a spy that records the template name; all other mailer exports are preserved via `jest.requireActual`.
- **`beforeEach`** – sets `NODE_MAIL_TRANSPORT` to `'outbox'` and clears `mockOutbox`.
- **`describe('POST /account/password/reset timing')`** – three integration tests:
  - *Slow repo, known address* – mocks `findByEmail` with a 600 ms delay; asserts the HTTP response arrives while the promise is still pending (`released === false`), then uses `eventually` to confirm the mail is queued.
  - *Slow repo, unknown address* – same 600 ms delay, `findByEmail` resolves `undefined`; asserts identical immediate 204 with no observable difference.
  - *Rejected repo* – `findByEmail` rejects; asserts `logger.error` is called with the expected message and the response is still 204.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/users/friends/account.ts` | The test imports `accountUserService` from this file and spies on its `findByEmail` method to simulate slow or failing user lookups. |
| `src/infrastructure/adapters/logger.ts` | The test imports `logger` from this file and spies on `error` to assert the failure path is logged. |
| `src/modules/users/tests/factories.ts` | `createUser` provisions a registered user for the known-address test. |
| `tests/support/http.ts` | `api()` provides the integration-test HTTP client. |
| `tests/support/setup-test-db.ts` | `setupTestDb` initialises the in-memory database for the suite. |
| `tests/support/environment.ts` | `setEnvironment` pins `NODE_MAIL_TRANSPORT` to `'outbox'`. |
| `tests/support/eventually.ts` | `eventually` polls until a post-response side-effect (mail, log) is observable. |

## Notes

- The 600 ms `setTimeout` in the mock is deliberately longer than the HTTP round-trip, ensuring the response assertion executes while the promise is still pending. Shorten it only if you also change the assertion strategy.
- `eventually` is used **after** the response for assertions about background work (mail enqueue, error log); it is not a substitute for awaiting the promise directly.
- The mailer mock spreads `jest.requireActual` so any future exports on the mailer module are not lost; adding a new export there won't silently break this test.
- `afterEach` calls `jest.restoreAllMocks()`; the `findByEmail` spy and `logger.error` spy are both restored automatically, but the module-level `jest.mock` for the mailer persists across tests (it is not restored by `restoreAllMocks`).
