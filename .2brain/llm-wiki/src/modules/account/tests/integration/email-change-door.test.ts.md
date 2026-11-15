---
source: src/modules/account/tests/integration/email-change-door.test.ts
sha256: 810733b365cc264582ec18eb4b73a3e070eb13c1582e87cc9ca8e1ea35bc1820
generated_at: 2026-11-14T19:02:27.466767+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/email-change-door.test.ts

## Purpose

Integration test suite for the `POST /account/email-change` endpoint — the single entry point for changing a user's email address. It pins the step-up requirement, the full repeat/conflict table (current, pending, replaced, taken), the two outbound mails, the audit row, and confirms that `PUT`/`PATCH /account` no longer accept an `email` field.

## Key elements

- **`mockOutbox`** — module-level array that captures every call to `enqueueEmail`; used by `mailsTo` to assert which recipients got which template.
- **`mailsTo(to, template)`** — counts how many queued mails of a given template were addressed to a given recipient.
- **`requestChange(bearer, email)`** — convenience helper that issues `POST /account/email-change` with a Bearer token.
- **`pendingOf(userId)`** — reads `pendingEmail` straight from the user row via the users repository, independent of API response.
- **`describe('POST /account/email-change', …)`** — the main block: happy-path (200 + two mails + audit), step-up 401, no-session 401, 409 `EMAIL_ALREADY_CURRENT`, 409 `EMAIL_CHANGE_ALREADY_PENDING`, 200 replacement after 60 s, 429 `EMAIL_CHANGE_TOO_SOON`, 409 `EMAIL_ALREADY_USED`, and 422 validation (parametrised via `it.each`).
- **`describe('PUT and PATCH /account no longer take an email', …)`** — asserts 422 when a client still sends `email` on the legacy update verbs.
- **Jest mocks** — the audit port module is replaced with the shared `auditPortMock` from the ports support file (replaced, not spied), and the mailer adapter is partially mocked so `enqueueEmail` appends to `mockOutbox`.

## Relationships

- **`tests/support/http.ts`** — provides the API client, bearer-token login, and the stale-bearer helper that triggers the reauth path.
- **`tests/support/setup-test-db.ts`** — initialises the test database before the suite runs.
- **`tests/support/environment.ts`** — sets `NODE_MAIL_TRANSPORT` to `outbox` so mail routes through the mocked adapter.
- **`tests/support/clock.ts`** — `freezeDate` / `advanceDate` control the 60-second rate-limit window deterministically.
- **`tests/support/ports.ts`** — provides `observePort` for capturing individual port invocations and the audit-port mock used to replace the real audit module.
- **`src/infrastructure/observability/audit.ts`** — the audit port module whose `emitAuditEvent` is the function under observation; replaced by the mock from the ports support file.
- **`src/modules/account/audit.ts`** — supplies the audit action constants used in assertions to verify the correct event code was emitted.
- **`src/modules/users/repository.ts`** — the user repository consulted by `pendingOf` to verify the stored `pendingEmail` state independently of the HTTP response.
- **`src/modules/users/tests/factories.ts`** — `createUser` creates users with specific emails and verification states for each scenario.

## Notes

- The audit port is **replaced** (via the ports-support mock), not spied on. Use `observePort` to capture individual calls; the replacement ensures no real audit I/O occurs.
- The 60-second rate-limit test relies on `freezeDate` + `advanceDate(61_000)`. The freeze must happen *before* the first request so both requests share a stable "now."
- Email comparison in the 409-current test is case-insensitive (`OLD@Example.com` vs. `old@example.com`) — the API normalises casing; the test verifies this explicitly.
- The stale-bearer helper simulates a session whose step-up token has expired for a sensitive action, triggering the unconditional reauth path even when no second factor is enrolled.
