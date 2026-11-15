---
source: src/modules/account/tests/integration/step-up-otp.test.ts
sha256: 809fe2d34ba107965a8bcf51c2fa27fb2d2cb042078225950da70c48f5716895
generated_at: 2026-11-14T19:12:19.641178+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/step-up-otp.test.ts

## Purpose

Integration tests covering the step-up OTP requirement for identity-sensitive account routes (email change, password change, account deletion). Verifies that sessions proven only by password are challenged for an `otp` method, that re-authentication via `POST /account/reauth` earns or denies OTP proof correctly, and that email changes can be undone from the old address's mailed link.

## Key elements

- **`mockOutbox` / `jest.mock('@infrastructure/adapters/mailer')`** — intercepts `enqueueEmail` so tests can read queued mail (template, recipient, link tokens) without a real transport.
- **`sessionWith(userId, amr)`** — mints a session token pair (bearer + cookie) via `continueSession` + `createAccessToken` with a chosen `amr` array, standing in for a pre-existing session rather than a first login.
- **`armedAccount(email?)`** — creates a verified user, logs in, arms TOTP (setup + confirm with `codeFor`), forgets the session epoch, and returns the user plus backup codes.
- **`tokenOfLastMail(template)`** — scans `mockOutbox` for the newest mail of a given template and extracts the `token` query-param from its `linkUrl`.
- **`requested()`** — orchestrates a full email-change request (create user → session → `requestChange`) and returns the user, bearer, undo token, and confirm token.
- **`undo(token)` / `requestChange(bearer, email?)`** — thin API-call helpers for the undo and email-change endpoints.
- **`statusOf(pending)` / `emailOf(userId)`** — small async helpers to flatten a Promise into a status code or read the stored email from `userRepository`.
- **Three `describe` blocks**: (1) identity-route gating with/without a second factor, (2) `POST /account/reauth` with OTP (valid, invalid, locked, wrong-password, no-2FA), (3) undoing a pending or confirmed email change.

## Relationships

- **`@tests/http` → `api()`** — all HTTP assertions go through this helper (supertest-style client).
- **`@tests/setup-test-db` → `setupTestDb()`** — called once at module top to provision/tear down the test database.
- **`@tests/environment` → `setEnvironment`** — sets `NODE_MAIL_TRANSPORT: 'outbox'` so the mailer mock is the active transport.
- **`@tests/totp` → `codeFor`** — generates a valid TOTP code from a secret for the setup-confirm step.
- **`@tests/session-epoch` → `forgetSessionEpoch`** — resets the session-epoch guard after the login that arms 2FA, so subsequent `sessionWith` calls aren't blocked.
- **`@modules/users/tests/factories`** — provides `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, and re-exports `userRepository`.
- **`@modules/users/repository` → `userRepository`** — used to read stored state (`email`, `mfaFailures`, `tokensValidAfter`, `previousEmail`, `pendingEmail`) and to update lock state (`updateMany`).
- **`../../session/jwt` → `createAccessToken`, `continueSession`** — used by `sessionWith` to mint a session from the token layer directly, bypassing the HTTP login flow.
- **`../factories` → `plantToken`, `removeTokensOfKind`** — imported for token-seeding utilities (available for test setup if needed).

## Notes

- The mailer mock spreads `requireActual` so non-`enqueueEmail` exports remain functional; only the enqueue function is replaced.
- `sessionWith` deliberately uses `continueSession` (a re-mint) rather than a first-session path; the comment notes a first-session mint would be refused by the app for an already-armed account.
- `forgetSessionEpoch` is called inside `armedAccount` after the login that triggers TOTP setup — without it, the epoch guard would reject the subsequent `sessionWith` call.
- The "wrong password does not spend an attempt" test asserts `mfaFailures` remains `0`, confirming the app validates password before touching the MFA counter.
- The undo test checks that `tokensValidAfter` is set (epoch bump), invalidating all outstanding sessions — a security invariant worth preserving.
- `tokenOfLastMail` uses `findLast` (ES2023); the build target must support it.
