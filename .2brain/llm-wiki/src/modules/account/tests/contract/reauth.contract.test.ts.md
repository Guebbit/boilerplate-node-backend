---
source: src/modules/account/tests/contract/reauth.contract.test.ts
sha256: 0f6d43b9437781363b5f45eaf6492608ded6d96c15be7b0642a88c426073710f
generated_at: 2026-10-29T02:52:15.988873+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/reauth.contract.test.ts

## Purpose

Contract tests for the **email-code step-up** path of account reauth. Covers which methods `GET /account/reauth` offers, the full send → submit → consume cycle for the mailed 6-digit code, replay/burn protection, stale-session re-proof, and the export-gating that follows a successful reauth. The password path's own session mechanics (cookie tiers, failed re-mint) are intentionally left to `api.contract.test.ts`.

## Key elements

- **`mockOutbox`** — array that captures every `enqueueEmail` call via a `jest.mock` of the mailer adapter; `mailedCode()` reads the latest `account.reauth-code` entry.
- **`sessionFor(amr, withPassword)`** — creates a user (with or without a password) and mints a session carrying the given AMR claims; returns `{ user, bearer, jwtCookie }`.
- **`reauthByEmail(bearer)`** — two-step helper: request a code, then submit it.
- **`describe('GET /account/reauth')`** — asserts the method list: `['password']`, `['email']`, or `[]` depending on account shape.
- **`describe('POST …/email/send')`** — verifies code is 6 digits, `sentTo` is masked, 429 cooldown on second send, 422 for password-holding accounts, 422 for unknown methods.
- **`describe('POST /account/reauth with a mailed code')`** — AMR on the re-minted session is `['email']` (not the original login's); single-use enforcement; wrong-code 422 (never 401); code burned after 5 wrong guesses; stale-session re-proof unlocks export (202) and file download; export *status* read is exempt from step-up.
- **`describe('the step-up window')`** — `NODE_REAUTH_TIME_SENSITIVE` is read per-request, so changing it mid-test shifts the stale boundary.
- **`describe('POST /account/reauth with a password')`** — (truncated) distinguishes "no password on account" (422, explicit) from "wrong password".

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Side-effect import that bootstraps the contract-test harness. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the in-memory DB. |
| `tests/support/environment.ts` | `setEnvironment` toggles `NODE_MAIL_TRANSPORT` and `NODE_REAUTH_TIME_SENSITIVE` per test. |
| `tests/support/http.ts` | `api()` for supertest-style calls; `bearerForCookie` to convert a JWT cookie back to a bearer after time-advance. |
| `tests/support/clock.ts` | `freezeDate` / `advanceDate` to simulate the step-up window elapsing. |
| `tests/support/file-sandbox.ts` | `emptyFileSandbox` in `afterEach` to clean up export artefacts. |
| `src/modules/users/tests/factories.ts` | `createUser` (password account), `userRepository` (no-password account), `PLAIN_PASSWORD`. |
| `src/modules/account/tests/factories.ts` | `mintSession` to create a session with arbitrary AMR. |
| `src/modules/account/tests/contract/support.ts` | `bearerIn` (extract bearer from a response), `claimedAmr` (decode AMR from the re-minted session). |
| `src/kernel/config.ts` | `reauthWindowSeconds('sensitive')` to compute how far to advance the clock. |
| `src/modules/account/model.ts` | `sessionModel` (imported; likely used by `claimedAmr` in support). |
| `src/modules/account/services/export.ts` | `settleInlineExports` to flush background export builds before asserting. |

## Notes

- The mailer is `jest.mock`'d at module level; nothing is ever sent. `NODE_MAIL_TRANSPORT: 'outbox'` is set in `beforeEach` so the app routes through the mock rather than the default `log` sink.
- The **replay test** uses `bearerIn(first)` — the re-mint *replaces* the session, so the old bearer is already invalid; the 422 under test is the code's single-use rule, not a 401.
- The **burn-after-5 test** deliberately picks a wrong code different from the real one (handles the edge where the mailed code is literally `000000`).
- `afterEach(() => jest.useRealTimers())` guards against leaked fake-timer state from the clock helpers.
- `afterEach` also calls `settleInlineExports().then(emptyFileSandbox)` to drain the background export worker and clear the filesystem sandbox, keeping the suite hermetic.
