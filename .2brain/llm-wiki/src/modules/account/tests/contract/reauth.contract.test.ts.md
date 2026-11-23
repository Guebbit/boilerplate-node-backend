---
source: src/modules/account/tests/contract/reauth.contract.test.ts
source_sha256: cd366e3e65246b0baeffa992bf50bc8aaf6f39c686d427dcc5dda0aaa846359d
context_sha256: 28244e5f755657ae1b09b6fd071e17de6fb38730abab5b5a70c716f6d6141a54
generated_at: 2026-11-22T03:51:04.369880+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/contract/reauth.contract.test.ts

## Purpose
Contract tests for step-up re-authentication in the account module. They cover which reauth methods an account is offered, the mailed-code flow for accounts without a password, and what the re-minted session claims (`amr`). The password path's session behaviour (cookie tiers, failed re-mint) is deliberately left to `api.contract.test.ts`.

## Key elements
- `mockOutbox`: array filled by a `jest.mock` of `@infrastructure/adapters/mailer`. `enqueueEmail` is replaced to push `{ template, data }` instead of sending, and the rest of the mailer module stays real.
- `mailedCode()`: returns the `code` from the latest `account.reauth-code` mail in the outbox.
- `sessionFor(amr, withPassword)`: builds a user (via `createUser`, or `userRepository.create` for a passwordless "oauthonly" account), then mints a session with the given `amr`. Returns `{ user, bearer, jwtCookie }`. It imitates an OAuth callback without a provider round trip.
- `reauthByEmail(bearer)`: requests a code through `/account/reauth/methods/email/send`, then spends it at `/account/reauth`.
- `describe` blocks:
  - `GET /account/reauth`: password offered when the account has one, email when it has none, and an empty list with no password and no verified address.
  - `POST /account/reauth/methods/email/send`: sends the code and returns a masked `sentTo`; 422 for an account with a password; 429 inside the cooldown; 422 for an unknown method such as `sms`.
  - `POST /account/reauth with a mailed code`:
    - the re-minted session claims only `['email']`;
    - a code works once;
    - a wrong code gives 422, never 401;
    - five wrong guesses burn the code;
    - a code with nothing sent gives 422;
    - an account with a password gets 422 even with a code.
  - The same block covers stale-session export behaviour:
    - after re-proof, `POST /account/export` goes from 401 to 202;
    - a stale `GET /account/export/file` returns 401;
    - a stale `GET /account/export` status read returns 200.
  - `the step-up window`: changing `NODE_REAUTH_TIME_SENSITIVE` takes effect per request. A stale `DELETE /account/sessions` returns 401 with `details: { maxAge: 60 }`.
  - `POST /account/reauth with a password`: begins at the end of the visible content (the visible start is a test about an account with no password).

## Relationships
- `@kernel/config` (`src/kernel/config.ts`): `reauthWindowSeconds('sensitive')` sets how far to advance the clock to make a session stale.
- `../../model` (`sessionModel`) and `../factories` (`mintSession`): create sessions with a chosen `amr`.
- `@modules/users/tests/factories` and the users repository: `createUser`, `userRepository`, and `PLAIN_PASSWORD` set up accounts.
- `./support`: `bearerIn` and `claimedAmr` read the bearer and `amr` from a re-mint response.
- `../../services/export`: `settleInlineExports()` waits for background export builds. It runs after each test and where a test needs a finished export.
- `tests/support` helpers:
  - `contract`: imported for its side effects.
  - `setup-test-db`: `setupTestDb()` prepares the database.
  - `environment`: `setEnvironment` overrides env vars.
  - `http`: `api()` and `bearerForCookie`.
  - `clock`: `freezeDate` and `advanceDate`.
  - `file-sandbox`: `emptyFileSandbox` sweeps written export files.

## Notes
- `NODE_MAIL_TRANSPORT` is set to `outbox` before each test, because the default `log` transport drops mail and the mailed code is offered only where mail reaches a person (`mailDelivers`).
- Every test clears the outbox and restores real timers in `afterEach`.
- Wrong-code tests pick `000000` or `111111` so the guess never equals the real code.
- The replay test uses `bearerIn(first)` because re-proof replaces the session. This keeps the 422 coming from the code rather than from a 401 on a dead session.
- Stale-session tests rely on `freezeDate()` and `advanceDate()` and on re-deriving the bearer with `bearerForCookie`.
- `sessionModel`, `PLAIN_PASSWORD` and `setEnvironment` are imported, and the visible part of the file doesn't show how `sessionModel` and `PLAIN_PASSWORD` are used. They are probably used in the password-path tests.
