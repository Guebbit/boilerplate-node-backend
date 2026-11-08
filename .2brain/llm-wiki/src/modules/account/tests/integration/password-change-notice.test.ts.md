---
source: src/modules/account/tests/integration/password-change-notice.test.ts
sha256: f28ed2cea39b340dfa2dc2bde7faa31f57689ae8a8712f7f02991725474061ce
generated_at: 2026-11-08T04:39:25.598169+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/password-change-notice.test.ts

## Purpose

Integration test that verifies the out-of-band "password changed" email is sent exactly once to the account's own address after a successful signed-in password change, contains recovery advice but no self-service link, and is **never** sent when the change is refused (wrong current password, mismatched confirmation, breached password) or when the flow is actually a reset (which mails its own `account.reset-confirm` template).

## Key elements

- **`mockOutbox`** — array that accumulates every call to `enqueueEmail`; cleared in `beforeEach`. Must carry the `mock` prefix (see Notes).
- **`jest.mock('@infrastructure/adapters/mailer', …)`** — replaces `enqueueEmail` with a spy that pushes `{ to, template, data }` onto `mockOutbox` while preserving all other exports via `requireActual`.
- **`mailsOf(template)`** — filters `mockOutbox` to the mails of a given template name.
- **`BREACHED`** (`'Password1!'`) — a password that satisfies composition rules but appears on the bundled breach list; used to exercise the breach-rejection path.
- **`describe('the notice after a signed-in password change')`** — the single suite, containing:
  - "mails the account once, with advice and no link" — happy-path assertions on recipient, `data.advice` text, and absence of `linkUrl`.
  - `it.each([...])` "mails nothing for %s" — three refusal scenarios (wrong current password, mismatched confirmation, breached new password) asserting `outcome.success === false` and an empty outbox for the template.
  - "is not what a reset sends" — plants a `password` token via `plantToken`, calls `completePasswordReset`, asserts zero `account.password-changed` mails and exactly one `account.reset-confirm` mail.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/services/index.ts` | Imports `accountService`; calls `passwordChangeWithCurrent` (happy + refusal cases) and `completePasswordReset` (reset-disambiguation case). |
| `src/modules/account/tests/factories.ts` | Imports `plantToken` to seed a `password`-type reset token for the reset test. |
| `src/modules/users/tests/factories.ts` | Imports `createUser`, `PASSPHRASE_PASSWORD`, `REPLACEMENT_PASSWORD` for user creation and password arguments. |
| `tests/support/callers.ts` | Imports `testCallerContext`, passed as the caller argument to every service call. |
| `tests/support/setup-test-db.ts` | Imports `setupTestDb`; called once at module level to initialise the in-memory/transactional DB before any test runs. |

## Notes

- **`mock` prefix is mandatory.** `jest.mock` is hoisted above all `import` statements, so the factory function can only reference module-scope identifiers whose name starts with `mock`. Renaming `mockOutbox` to, say, `outbox` will cause a `ReferenceError` at runtime.
- The test asserts the email body contains the string `"Forgot password"` (via `expect.stringContaining`) but does **not** assert a specific URL — the contract is "advice, no link," not "advice, *this* link."
- `setupTestDb()` is called at module scope (not in `beforeEach`), implying it is idempotent or safe to run once per test file.
