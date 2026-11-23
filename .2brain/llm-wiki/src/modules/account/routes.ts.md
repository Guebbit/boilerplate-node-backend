---
source: src/modules/account/routes.ts
source_sha256: b9174c77cd1c0b00a1a438b75ab302bf084d2f9b4043488dac0471ebad882aea
context_sha256: 11ec0b0171d13485b9f8560315753d71bfcdf55efdc95aaec0df731ec0df84ff
generated_at: 2026-11-22T03:34:56.706937+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/routes.ts

## Purpose
Express router for the account module. It wires HTTP endpoints under `/account` for auth (login, signup, refresh, logout), password reset and change, email verification and change, two-factor auth, re-authentication, sessions, account export, deletion and restore, and OAuth links. It also decides which middleware guards each route: rate limiters, auth, fresh-auth step-up, origin checks, idempotency and uploads. The address book shares the `/account` prefix but lives in `@modules/addresses/routes`. The router is mounted from `./module.ts`.

## Key elements
- `router`: the exported Express `Router`. It applies `getAuth` and `noStore` to every route.
- `callerHasTwoFactor(request)`: returns true when `request.authContext?.twoFactorArmed === true`. It is used as the condition for `requireFreshAuthWhen`.
- `OTP_PROOF`: `{ methods: ['otp'] }`. It is the proof an account with a second factor must have given in its fresh session.
- Profile routes:
  - `GET /` is `isAuth` + `getAccount`.
  - `PUT /` and `PATCH /` use `uploadLimiter`, `isAuth` and the image upload middleware, then `replaceAccount` / `updateAccount`. There is no fresh-auth gate.
- Email change:
  - `POST /email-change` needs `isAuth`, a `sensitive` fresh session (plus an `otp` proof when a second factor is armed) and `signedInCredentialLimiters`.
  - `DELETE /email-change` (cancel) and `POST /email-change/resend` are `isAuth` only.
- Deletion and restore:
  - `DELETE /` needs a `critical` fresh session, plus an `otp` proof when a second factor is armed.
  - `POST /restore` is public, guarded by `credentialLimiters`.
- Public credential routes:
  - `POST /login` uses `credentialLimiters` and `loginChallengeGate`.
  - `POST /signup` uses `signupLimiters`, `mailRecipientLimiter`, `humanChallengeGate` and `idempotencyKey`, and is JSON only.
  - `POST /password/reset` uses `resetRequestLimiters`, `mailRecipientLimiter` and `humanChallengeGate`.
  - `POST /password/reset/confirm` uses `credentialLimiters`.
  - `POST /password/check` uses `passwordCheckLimiters`.
- Signed-in password and re-auth:
  - `POST /password` runs `isAuth`, then a `sensitive` fresh-auth check (when two-factor is armed), then `signedInCredentialLimiters`.
  - `GET /reauth` is plain `isAuth`.
  - `POST /reauth` uses `isAuth` and `signedInCredentialLimiters`.
  - `POST /reauth/methods/:method/send` uses `accountCodeSendLimiter`.
- `POST /refresh`: guarded by `requireAllowedOrigin`, then `getRefreshToken`.
- Other controllers are imported for 2FA (`get2fa`, `post2fa*`), logout, sessions (`getSessions`, `getSession`, `deleteSession`, `postSessionTouch`), verification, account export and OAuth link/callback flows. The routes that register them fall beyond the visible portion of the file.

## Relationships
- `@kernel/middlewares/authorizations`: provides `getAuth`, `isAuth`, `requireFreshAuth` and `requireFreshAuthWhen`.
- `@infrastructure/http/middlewares/rate-limit`: provides `uploadLimiter`. The other limiters come from the local `./rate-limits`, and `mailRecipientLimiter` from `./mail-budget`.
- `@infrastructure/http/middlewares/human-challenge`: provides `humanChallengeGate`, used on signup and password-reset request.
- `@infrastructure/http/middlewares/idempotency`: provides `idempotencyKey`, used on signup.
- `@infrastructure/http/middlewares/upload`: provides the image upload middleware for the profile PUT and PATCH.
- `@infrastructure/http/middlewares/cache`: provides `noStore`, applied router-wide.
- `@infrastructure/http/middlewares/origin`: provides `requireAllowedOrigin`, used on `/refresh`.
- `./controllers/*`: each route delegates to one handler, for example `get-account`, `delete-account`, `delete-email-change`, `delete-session`, `get-2fa`, `get-account-export` and `get-oauth-callback`. `delete-oauth-link` is also imported.

## Notes
- `noStore` is mounted on the whole router so a new route cannot forget it. `setCache` replaces `Cache-Control`, so it refuses to run on a response `noStore` has marked. This includes `GET /account`.
- Middleware order matters. `isAuth` must come before `signedInCredentialLimiters` so the budget is keyed per account, because the body names no account.
- `signupLimiters` and `resetRequestLimiters` replace `credentialLimiters` because those routes answer success (201 or 200) even when abusive, and `credentialLimiters` skips successful requests.
- `passwordCheckLimiters` is keyed by address and block directly, because the body carries no email or username.
- `humanChallengeGate` and `loginChallengeGate` are "rung 3" gates that are off by default. The login gate only engages once the identity or block budget is mostly spent.
- Signup accepts no upload. The avatar is set afterwards with `PATCH /account`.
- `GET /reauth` and `POST /reauth/methods/:method/send` have no fresh-auth guard, since they are how a session becomes fresh.
- Per the module header, session-eviction routes (`DELETE /sessions`, `DELETE /sessions/:sessionId`) also require a fresh session.
