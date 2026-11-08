---
source: src/modules/account/tests/integration/reset-request-timing.test.ts
sha256: e7c8f67a10b2c3ce6e5f05d46e2317282e8b27ca89b6119b4dfe7a9233e55b2e
generated_at: 2026-11-08T04:41:02.328466+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/reset-request-timing.test.ts

## Purpose

Integration tests that verify `POST /account/password/reset` responds **immediately** (204) regardless of how long the underlying repository lookup takes, and that any backend failure is logged rather than surfaced to the client. This protects against user-enumeration: the response must not wait for or leak the outcome of the token lookup.

## Key elements

- **`mockOutbox`** — module-level array that collects `{ template }` entries whenever the mailer's `enqueueEmail` is called (via the `jest.mock` of `@infrastructure/adapters/mailer`).
- **`jest.mock('@infrastructure/adapters/mailer', …)`** — replaces `enqueueEmail` with a spy that pushes to `mockOutbox` and resolves, leaving the rest of the mailer intact.
- **`setupTestDb()`** — initialises a throwaway database for the suite (called once at module scope).
- **`beforeEach`** — sets `NODE_MAIL_TRANSPORT` to `'outbox'` (via `setEnvironment`) and clears `mockOutbox`.
- **`afterEach`** — `jest.restoreAllMocks()` to undo any `spyOn` calls.
- **Test: "answers before a slow repository does…"** — spies on `userService.findByEmail` with a 600 ms delay, asserts the 204 arrives while `released` is still `false`, then polls `mockOutbox` via `eventually` to confirm the mail was queued once the lookup finished.
- **Test: "answers an unknown address in the same breath…"** — same slow-lookup mock but resolving `undefined`; asserts 204 + `released === false` and (implicitly) no mail is sent.
- **Test: "logs a failure behind the answer…"** — `findByEmail` rejects; asserts 204 is still returned and `logger.error` was called with a message containing `'A password reset request failed.'`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/http.ts` | `api()` builds the HTTP client used in every request. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` provisions the test database before any test runs. |
| `tests/support/environment.ts` | `setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' })` ensures the app routes mail through the mocked outbox transport. |
| `tests/support/eventually.ts` | `eventually()` polls an assertion until it passes or times out (used for async side-effects like mail enqueueing and log emission). |
| `src/modules/users/tests/factories.ts` | `createUser()` creates a real user row for the "known address" scenario. |
| `src/modules/users/index.ts` | Exports `userService`, whose `findByEmail` method is spied on in every test. |
| `src/modules/users/services/index.ts` | Re-export layer that makes `userService` reachable from the `@modules/users` barrel. |
| `src/infrastructure/adapters/logger.ts` | `logger.error` is spied on to assert that backend failures are logged (not swallowed) after the 204 is sent. |

## Notes

- The mock for `@infrastructure/adapters/mailer` uses `jest.requireActual` to preserve the rest of the module; only `enqueueEmail` is replaced.
- `setupTestDb()` is called at **module scope** (not in a `beforeAll`), so it runs once when the test file is loaded.
- The "unknown address" test does **not** assert that no mail is queued — it only checks timing. The absence of a mail assertion is intentional: the contract under test is timing, not the mail-decision logic (covered elsewhere).
- `afterEach` relies on `restoreAllMocks` rather than manual `mockRestore`, so any new spy added to a test is cleaned up automatically.
