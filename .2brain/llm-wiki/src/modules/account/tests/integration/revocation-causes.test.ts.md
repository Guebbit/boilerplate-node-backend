---
source: src/modules/account/tests/integration/revocation-causes.test.ts
generated_at: 2026-11-22T04:00:02.357559+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/revocation-causes.test.ts

## Purpose
Integration test that drives every cause in the `REVOCATION` table through its real HTTP (or token-layer) entry point and checks that what happened matches what the cause's row declares. Because the trigger map is typed `Record<RevocationCause, Trigger>`, adding a cause to the table without a trigger here fails compilation.

## Key elements
- `MODES` / `sessionMode`: the two session modes (`jwt`, `cookie`). The whole suite runs under `describe.each(MODES)`; `sessionMode` is set in `beforeEach` so `loginAs` knows which mode it is in.
- `loginAs(email)`: logs in via `POST /account/login` and returns a `bearer` header and, in `jwt` mode, the `__Host-session` refresh cookie as a `Cookie` header. In `cookie` mode it signs in with `transport: 'bearer'`.
- `Scenario` / `Trigger`: a trigger sets up state and returns `{ userId, victim, fire }`. `victim` is the bearer of another device, and `fire()` performs the cause.
- `accountWithVictim(email)`: creates a verified user, plants a pending `verify` token, and logs in a "victim" device.
- `via*` triggers: one per cause.
  - `viaPasswordChange`: `POST /account/password`.
  - `viaPasswordReset`: `POST /account/password/reset/confirm`.
  - `viaLogoutAll`: `DELETE /account/sessions`.
  - `viaEmailConfirm`: `POST /account/email-change/confirm`.
  - `viaEmailUndo`: `POST /account/email-change/undo`.
  - `viaTwoFactorConfirm`: TOTP setup, then `POST /account/2fa/methods/totp/confirm`.
  - `viaBan`: an admin calls `POST /users/:id/deactivate`.
  - `viaDeletion`: `DELETE /account`.
  - `viaRefreshReuse`: calls `rotateRefreshToken` directly on a superseded token and expects `TokenReuseError`.
- `TRIGGERS`: the typed map from cause to trigger.
- `works(bearer)`: returns whether `GET /account` returns 200.
- `JWT_ONLY`: causes skipped in `cookie` mode (currently `refresh-reuse`).
- The test itself, per mode and cause, asserts that:
  - the victim bearer no longer works;
  - the user has 1 session row if `row.callerKeeps`, otherwise 0;
  - the `verify` token survives only if `!row.pending`;
  - `account.sessions_revoked` outbox events equal `[{ userId, reason: cause }]` if `row.announce`, otherwise none.

## Relationships
- `src/modules/account/domain/revocation.ts`: provides `REVOCATION` (the table under test, with the `pending`, `announce` and `callerKeeps` flags) and the `RevocationCause` type.
- `src/modules/account/session/jwt.ts`: `startSession`, `rotateRefreshToken` and `TokenReuseError` are used directly by the refresh-reuse trigger.
- `src/kernel/outbox.ts`: `outboxEventModel` is queried for the `account.sessions_revoked` events, and `settleOutboxNudges` is awaited after firing.
- `src/modules/account/tests/factories.ts`: `plantToken`, `sessionRowsOf` and `tokenTypesOf` seed and inspect token and session rows.
- `src/modules/users/tests/factories.ts`: `createUser`, `userRepository`, `PLAIN_PASSWORD` and `REPLACEMENT_PASSWORD`. The email triggers use `userRepository.updateMany` to set `pendingEmail` and `previousEmail`.
- `src/modules/users/repository.ts`: not imported directly by this file; the `userRepository` it uses comes from the users test factories.
- `tests/support/*`:
  - `http.ts`: `api` and `authenticateAs('admin')`.
  - `setup-test-db.ts`: DB lifecycle.
  - `environment.ts`: `setEnvironment`.
  - `totp.ts`: `codeFor`.
  - `cookies.ts`: `cookieHeader`.
- `src/modules/account/tests/unit/family-liveness.test.ts` is a graph neighbor, but this file does not import it.

## Notes
- `beforeEach` sets `NODE_MAIL_TRANSPORT=outbox`, `NODE_TOKEN_ROTATION_GRACE_MS=1` and `NODE_TOKEN_REUSE_WINDOW_MS=600000`. Each mode additionally sets `NODE_SESSION_MODE`.
- The test sleeps 1100 ms (`PAST_THE_SECOND_MS`) before firing, so tokens already issued fall before the revocation epoch, which is set at one-second granularity. The refresh-reuse trigger also sleeps 20 ms to get past the 1 ms grace window, so the replay counts as theft.
- Most triggers log in a second "caller" session. The ban trigger uses an admin and the refresh-reuse trigger uses no caller. The `callerKeeps` assertion is made against the session rows of whichever scenario ran.
