---
source: tests/integration/journeys/an-accounts-whole-security-life.test.ts
sha256: ea3b8f093a40f3fe372b5c8fcf304ba687540f294280bdc8d27d1f0d7fb022ad
generated_at: 2026-11-14T23:14:48.851252+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/an-accounts-whole-security-life.test.ts

## Purpose

End-to-end journey test that walks a single account through its full security lifecycle in one `it` block: Altcha-gated signup, email verification, admin role grant, TOTP enrolment, API-key mint, password reset (which must revoke every session and credential), step-up reauth for email change, 7-day undo-link expiry, and data-export expiry. It exists to verify that every security control composes correctly and that the audit trail and outbound mail reflect the same sequence.

## Key elements

- **`ACCOUNT`** – constant holding the email, username, two passwords, and the moved-to address used throughout the journey.
- **`signIn(email, password, code)`** – performs a two-step login (password → 2FA), extracts the `__Host-session` cookie, and returns it so the caller can mint a one-use bearer via `bearerForCookie`.
- **`beforeEach` / `afterEach`** – resets the outbox-mail sink, installs the Altcha stub, and restores real Jest timers.
- **`it('keeps the account safe…')`** – the single test body; ~120 lines of sequential assertions covering every stage listed in Purpose.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/access/tenant.ts` | Imports `DEPLOYMENT_TENANT_ID` to seed the account as tenant admin via `seedMembership`. |
| `src/modules/access/tests/factories.ts` | Imports `seedMembership` to grant the admin role after signup. |
| `src/modules/account/services/export.ts` | Imports `settleInlineExports` to synchronously run the export pipeline before asserting the file is downloadable. |
| `tests/support/altcha.ts` | `useAltcha()` installs the human-check stub; `solvedChallenge()` produces the header value for signup and password-reset requests. |
| `tests/support/body-of.ts` | `bodyOf` parses the audit-list response into a typed Zod object for the final trail assertion. |
| `tests/support/clock.ts` | `freezeDate` / `advanceDate` drive every time-sensitive check (session staleness, TOTP step rotation, 7-day link expiry). |
| `tests/support/contract.ts` | Side-effect import that wires contract-test assertions into the supertest setup. |
| `tests/support/cookies.ts` | `setCookie` extracts the session cookie from a raw response. |
| `tests/support/drain.ts` | `runJob('reap:previous-emails')` and `runJob('reap:account-exports')` trigger the background sweeps that must clear stale rows. |
| `tests/support/http.ts` | `api()` for supertest calls, `loginBearer` for the initial TOTP setup, `bearerForCookie` for converting session cookies to one-use bearer tokens. |
| `tests/support/journey-mail.ts` | `useOutboxMail`, `waitForMail`, `mailsTo` for capturing and asserting outbound mail (verification, reset, revocation, export-ready, undo). |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the in-memory/test database before any test runs. |
| `tests/support/totp.ts` | `codeFor(secret, step)` generates a TOTP code for a specific time-step, letting the test pin the 30-second window. |

## Notes

- **One `it` block, many stages.** The entire journey is a single test; a failure mid-stream leaves earlier assertions unreported. Read the `expect` calls in order to find the first break.
- **Single-use refresh token.** `signIn` deliberately returns the cookie, not a bearer, because calling `bearerForCookie` a second time on the same cookie will 401. Every stage mints its own bearer from a fresh sign-in.
- **TOTP step indices are load-bearing.** The test advances the clock enough between sign-ins that reusing step `0` is valid (≥ 30 s have passed). If you shorten a `advanceDate` call, a subsequent `codeFor(secret, 0)` may collide with a previously used step and the server will reject it.
- **Session staleness window.** After `freezeDate` + 60 s, the session is "fresh." After an additional ~15 min (`901_000` ms) it enters the sensitive window, which is what triggers `REAUTH_REQUIRED` on the email-change call. Adjusting either value changes which path is exercised.
- **Export sweep vs. retention.** The test asserts two distinct states for a lapsed export: the file route returns 404 immediately after expiry, while the metadata route also returns 404 *before* the `reap:account-exports` job runs (the export "counts as none"). Only after the job does the row disappear from the DB.
- **Clock is forward-only.** The file never calls `freezeDate` to go backwards; every `advanceDate` is strictly positive. This mirrors production semantics where a session or token cannot become "less expired."
