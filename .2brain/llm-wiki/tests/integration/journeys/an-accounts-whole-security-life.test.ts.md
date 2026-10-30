---
source: tests/integration/journeys/an-accounts-whole-security-life.test.ts
sha256: 8ff6cc5209f1f50b850da1354a7c2185803001b70740a57c257561f30ac7ab71
generated_at: 2026-10-29T06:56:23.488486+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/an-accounts-whole-security-life.test.ts

## Purpose

A single, sequential integration journey that walks one account through its entire security life—signup behind a human check, TOTP enrollment, machine-credential minting, password reset (revoking sessions and keys), step-up reauth before an email change, and the two time-limited links (email-change undo, data export)—then verifies the audit trail and outbound mail match the story.

## Key elements

- **`ACCOUNT`** — constant bag holding the test account's email, username, initial password, replacement password, and the email it moves to.
- **`signIn(email, password, code)`** — performs password login + 2FA, returns the 2FA response and the `__Host-session` cookie for bearer exchange.
- **`DAY_MS`** — 86 400 000 ms, used to compute expiry windows and clock jumps.
- **`beforeEach` / `afterEach`** — installs the mail outbox and Altcha mock; restores real Jest timers after each run.
- **The single `it` block** — the entire journey from signup to the last lapsed link, with time advances between phases and audit/mail assertions at the end.

## Relationships

- **`@tests/contract`** — loaded for side-effect; enables API-schema validation on every response.
- **`@tests/http`** — provides `api`, `bearerForCookie`, `loginBearer` for all HTTP calls and bearer-token derivation.
- **`@tests/altcha`** — `useAltcha()` installs the human-check mock; `solvedChallenge()` produces a valid challenge header for signup and password-reset requests.
- **`@tests/journey-mail`** — `useOutboxMail`, `waitForMail`, `mailsTo` drive all mail-based assertions (verification, reset, export-ready, undo-notice).
- **`@tests/clock`** — `freezeDate` / `advanceDate` control the frozen clock after the password-reset phase.
- **`@tests/totp`** — `codeFor(secret, step)` generates the correct TOTP code for a given time-step under the frozen clock.
- **`@tests/cookies`** — `setCookie` extracts the `__Host-session` cookie from login responses.
- **`@tests/body-of`** — `bodyOf` parses and schema-validates the audit-list response before asserting actions.
- **`@tests/drain`** — `runJob` triggers the `reap:previous-emails` and `reap:account-exports` cleanup jobs and returns their result.
- **`@tests/setup-test-db`** — `setupTestDb` isolates the database for the suite.
- **`@kernel/access/tenant`** — `DEPLOYMENT_TENANT_ID` identifies the tenant passed to the membership seed.
- **`@modules/access/tests/factories`** — `seedMembership` grants the new account the `tenant/admin` role so it can mint API keys.
- **`@modules/account/services/export`** — `settleInlineExports` forces the async export job to complete synchronously so the test can immediately fetch the file.

## Notes

- The entire journey lives in **one `it` block**; phases are separated only by comments. A failure anywhere makes the rest unrunnable.
- After the password-reset phase the clock is **frozen** and only moves forward. Every TOTP call uses an explicit time-step index (`codeFor(secret, 0)` / `codeFor(secret, 1)`) rather than wall-clock time.
- Arming TOTP **invalidates the session that performed it**; the test asserts 401 on the old bearer before signing in again.
- The reauth response may carry either a JWT `token` or a cookie-based `sessionToken` depending on session type; the test handles both with a fallback.
- The audit assertion uses `expect.arrayContaining`, so it checks presence of actions, **not** strict ordering or exact count.
- `settleInlineExports` is a test-only call into the production export service; without it the 202 response would leave the file in a pending state.
- The export-expiry check verifies both `/account/export/file` (404) **and** `/account/export` (404, "counts as none") before the reap job drops the record.
