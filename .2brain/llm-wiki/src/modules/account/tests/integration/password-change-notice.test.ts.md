---
source: src/modules/account/tests/integration/password-change-notice.test.ts
sha256: f28ed2cea39b340dfa2dc2bde7faa31f57689ae8a8712f7f02991725474061ce
generated_at: 2026-10-29T02:58:10.788543+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/password-change-notice.test.ts

## Purpose

Integration tests verifying the out-of-band email notice sent to the account's address after a **signed-in** password change succeeds. Confirms the notice is sent exactly once with advice text and no link, is **not** sent when the change is refused (wrong current password, mismatched confirmation, breached new password), and is distinct from the separate confirmation mail a password **reset** sends.

## Key elements

- **`mockOutbox`** — Module-level array that captures every queued email (`to`, `template`, `data`). Cleared in `beforeEach`.
- **`jest.mock('@infrastructure/adapters/mailer')`** — Replaces `enqueueEmail` with a spy that pushes into `mockOutbox` and resolves immediately; all other mailer exports are kept via `requireActual`.
- **`mailsOf(template)`** — Filters `mockOutbox` to entries matching a given template name.
- **`BREACHED`** (`'Password1!'`) — A password that is on the bundled breach list yet still satisfies composition rules, isolating the breach check as the sole failure reason.
- **`describe('the notice after a signed-in password change')`** — Contains four tests:
  - Success: one `account.password-changed` mail, addressed to the user, containing `advice` (references "Forgot password"), and **no** `linkUrl` in the payload.
  - Three refused-change cases (parametrized via `it.each`): no `account.password-changed` mail queued.
  - Reset isolation: a completed reset queues `account.reset-confirm` but **not** `account.password-changed`.

## Relationships

- **`src/modules/account/services/index.ts`** — Provides `accountService`, whose `passwordChangeWithCurrent` and `completePasswordReset` methods are the SUT under test.
- **`src/modules/users/tests/factories.ts`** — Supplies `createUser`, `PASSPHRASE_PASSWORD`, and `REPLACEMENT_PASSWORD` fixtures.
- **`src/modules/account/tests/factories.ts`** — Supplies `plantToken` to seed a reset token for the reset-isolation test.
- **`tests/support/callers.ts`** — Supplies `testCallerContext`, the caller object passed to every service invocation.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initializes the in-memory test database before the suite runs.

## Notes

- The `mock*` prefix on `mockOutbox` is **mandatory**, not stylistic: `jest.mock` is hoisted above `import` statements and may only reference identifiers that begin with `mock`.
- The success test asserts the absence of `linkUrl` via `JSON.stringify` to cover the entire payload (including nested data), not just a top-level key.
- The breached-password case uses a password that passes composition rules so the test isolates the breach check specifically; a weak password would fail composition first and would not exercise the same code path.
