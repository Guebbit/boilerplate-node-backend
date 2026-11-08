---
source: src/modules/account/tests/contract/reauth.contract.test.ts
sha256: 0f6d43b9437781363b5f45eaf6492608ded6d96c15be7b0642a88c426073710f
generated_at: 2026-11-08T04:32:25.271661+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/reauth.contract.test.ts

## Purpose

Contract tests for the **step-up reauthentication** (reauth) endpoints. It verifies which reauth methods are offered to a given account, the full email-code flow (send → spend → re-mint with `amr`), code-burn and replay rejection, stale-session re-proof for sensitive actions (export, download, session deletion), and that the step-up window is read per-request. The password-path session behaviour (cookie tiers, failed re-mint) is intentionally left to `api.contract.test.ts`.

## Key elements

- **`mockOutbox`** — module-level array that captures every `enqueueEmail` call (template + data) via the `jest.mock` of `@infrastructure/adapters/mailer`.
- **`mailedCode()`** — pulls the 6-digit code from the most recent `account.reauth-code` entry in `mockOutbox`.
- **`sessionFor(amr, withPassword)`** — creates a user (password or OAuth-only) and mints a session with the given `amr` claims; returns `{ user, bearer, jwtCookie }`.
- **`reauthByEmail(bearer)`** — convenience: POSTs the send-code endpoint, then immediately spends the code via `POST /account/reauth`.
- **`GET /account/reauth`** suite — asserts `methods: ['password']`, `['email']`, or `[]` depending on account state.
- **`POST /account/reauth/methods/email/send`** suite — verifies 200 with masked `sentTo`, 422 for password-holding or unknown methods, and 429 cooldown with a countdown.
- **`POST /account/reauth` (mailed code)** suite — checks that the re-minted session claims only `['email']`, code is single-use, wrong codes return 422 (never 401), code burns after 5 wrong guesses, and stale sessions can re-proof for export/download.
- **`the step-up window`** suite — confirms `NODE_REAUTH_TIME_SENSITIVE` is read per-request, not cached.
- **`POST /account/reauth` (password)** suite — asserts a no-password account gets a distinct 422 message, not "wrong password".

## Relationships

- **`tests/support/contract.ts`** — imported for side-effect (sets up the shared contract-test harness).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the test database.
- **`tests/support/environment.ts`** — `setEnvironment` toggles `NODE_MAIL_TRANSPORT` and `NODE_REAUTH_TIME_SENSITIVE` between tests.
- **`tests/support/http.ts`** — `api()` builds supertest-style requests; `bearerForCookie` extracts a bearer token from a JWT cookie.
- **`tests/support/clock.ts`** — `freezeDate` / `advanceDate` simulate passage of the step-up window.
- **`tests/support/file-sandbox.ts`** — `emptyFileSandbox` cleans up export artefacts after each test.
- **`src/modules/users/tests/factories.ts`** — `createUser`, `userRepository`, `PLAIN_PASSWORD` seed users.
- **`src/modules/users/repository.ts`** — accessed through the factories to create password-less accounts directly.
- **`src/modules/account/tests/factories.ts`** — `mintSession` creates a valid session with arbitrary `amr` claims.
- **`src/modules/account/tests/contract/support.ts`** — `bearerIn` extracts the bearer from a reauth response; `claimedAmr` decodes the `amr` claim from the new session.
- **`src/modules/account/model.ts`** — `sessionModel` imported (used indirectly by helpers).
- **`src/modules/account/services/export.ts`** — `settleInlineExports` drains the background export queue so `afterEach` can clean the sandbox.
- **`src/kernel/config.ts`** — `reauthWindowSeconds` provides the sensitivity-appropriate window used in stale-session tests.

## Notes

- The mailer adapter is **mocked**; no real email is ever sent. The `beforeEach` also resets `mockOutbox` to prevent cross-test leakage.
- `NODE_MAIL_TRANSPORT: 'outbox'` is set per-test because the suite's default (`log`) would suppress the email method from the reauth offer.
- The wrong-code test picks a code string that is guaranteed different from the real one (`'000000' === mailedCode() ? '111111' : '000000'`) to avoid a flaky pass.
- `afterEach` always calls `jest.useRealTimers()` after any `freezeDate`/`advanceDate` usage, preventing timer leaks into subsequent tests.
- The export-status read (`GET /account/export`) is intentionally allowed for a stale session because it returns no personal data; the download (`GET /account/export/file`) and the build trigger (`POST /account/export`) both require a fresh reauth.
