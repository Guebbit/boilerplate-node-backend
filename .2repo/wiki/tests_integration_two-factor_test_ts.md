# tests/integration/two-factor.test.ts

## Purpose

End-to-end integration suite for the full two-factor authentication lifecycle (enroll → confirm → challenge login → disable → admin recovery). Drives the real Express app over HTTP so routing, auth guards, and serialization all execute. The final describe block ("the bypass") is the security-critical assertion: a challenge token must never pass `isAuth` as a standalone credential.

## Key elements

- **`codeFor(secret, stepsFromNow = 0)`** — Generates an RFC 6238 TOTP code for `secret` at a time step offset from the current 30-second window. `stepsFromNow = 1` is used after enrollment (which already consumed the "now" step) to land on the next window and avoid replay rejection.
- **`enrollTwoFactor(bearer)`** — Convenience helper: POSTs `/account/2fa/setup` then `/account/2fa/confirm` with a valid code. Returns `{ secret, backupCodes }` for use in subsequent login/disable tests.
- **`describe('enrollment')`** — Covers auth requirement, secret/URI shape, wrong-code rejection, backup-code count/uniqueness, and that a pending (unconfirmed) secret does not alter login behaviour.
- **`describe('logging in with 2FA enabled')`** — Challenge issuance (no session cookie set), wrong-code rejection, correct-code success with `amr: ['pwd','otp']` in the JWT, replay protection (same code rejected on a second login), one-time backup codes, and 429 rate-limiting after 6 wrong attempts.
- **`describe('disabling 2FA')`** — Wrong-code rejection on `DELETE /account/2fa`; successful disable followed by a normal (non-challenge) login.
- **`describe('admin-assisted recovery')`** — Admin can strip 2FA via `DELETE /users/:id/2fa` without a code; non-admin receives 403.
- **`describe('the bypass …')`** — Asserts that presenting a raw challenge string as a Bearer token yields 401 from `isAuth`.

## Relationships

- **`tests/support/http.ts`** — Supplies `api()` (the Supertest instance bound to the running Express app) and `authenticateAs(role?)` which creates a user, logs in, and returns `{ bearer, user }`. Every request in this file goes through these helpers.
- **`tests/support/setup-test-db.ts`** — Supplies `setupTestDb()`, called once at module top-level to seed/reset the in-memory test database before any test runs.

## Notes

- **TOTP window stepping is deliberate.** Enrollment's confirm call consumes the current 30 s window; any subsequent code must be generated with `stepsFromNow = 1`. The server's `epochTolerance` is symmetric, so a one-step-ahead code still verifies immediately—no real-time wait is needed.
- **`jsonwebtoken.decode` (not `verify`)** is used to inspect the `amr` claim; this is safe here because the token was just issued by the server under test.
- The bypass test at the bottom is explicitly called out in the file's header comment as the single most important assertion in the suite.
- `setupTestDb()` is invoked at module scope (not inside a `beforeAll`), meaning it runs during import before Jest collects tests.
