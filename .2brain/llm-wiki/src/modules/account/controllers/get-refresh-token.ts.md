---
source: src/modules/account/controllers/get-refresh-token.ts
source_sha256: a731c7a7b6f416a0c2c0853701129a2c548cea4ee0ee9b40e663fcbe41179e87
context_sha256: 19a488131fd5bb411ca6d5e37ea021afdbed1c97ba623f3803938f2defc2a22e
generated_at: 2026-11-22T03:22:13.771574+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/get-refresh-token.ts

## Purpose
Express controller for `POST /account/refresh`. It is a thin HTTP adapter over `accountService.refreshAccessToken`. It exchanges the refresh cookie for a new short-lived access token and rotates the refresh cookie in the same response. It is available in `jwt` session mode only.

## Key elements
- `getRefreshToken(request, response)` is the only export. Its flow:
  - In `cookie` session mode it responds with 404 and returns. A cookie-mode session has a single credential that never rotates, so there is nothing to refresh.
  - It reads the refresh token with `readSessionCookie(request)`. The token is cookie-only by design, because a token in the URL would leak into history, proxy logs and `Referer` headers.
  - It calls `accountService.refreshAccessToken(refreshToken, callerContextOf(request))`. That call returns `userId`, `accessToken`, the rotated `refreshToken` and `refreshMaxAgeMs`.
  - It loads the user's abilities with `abilitiesOfUser(userId)`. If that returns nothing, it throws `TokenRejection('revoked', 'User not found')`.
  - On success it:
    - sets the rotated refresh cookie via `createSessionCookie(response, rotated, refreshMaxAgeMs)`;
    - increments `authRefreshTotal` with `status: 'success'`;
    - sends `successResponse<RefreshTokenResponse>` with `{ token, abilities }`.
- Error handling in the `.catch`:
  - Infrastructure errors go to `rejectDatabaseError(response, 'refreshAccessToken', error)`, which gives a retryable 503. This path does not increment the failure metric.
  - Every other error increments `authRefreshTotal` with `status: 'failure'`.
  - A `TokenRejection` with reason `idle` returns 401 with `ERROR_CODES.SESSION_IDLE` and the i18n message `account.session-idle`.
  - Everything else returns a bare 401.

## Relationships
- `../services` (`accountService`) performs the refresh and rotation. This controller only adapts it to HTTP.
- `../session/cookies` (`createSessionCookie`) writes the rotated cookie. `@kernel/cookies` (`readSessionCookie`) reads the incoming one.
- `../session/config` (`getSessionMode`) provides the `jwt` vs `cookie` mode check.
- `../session/jwt` provides `TokenRejection`, which the controller throws and inspects.
- `../session/account-view` (`abilitiesOfUser`) supplies the abilities returned to the client.
- `../metrics` (`authRefreshTotal`) is the counter for refresh outcomes.
- `@infrastructure/http/response` supplies `successResponse` and `rejectResponse`. `@infrastructure/http/errors` supplies `isInfrastructureError` and `rejectDatabaseError`. `@infrastructure/http/request` supplies `callerContextOf`.
- `@infrastructure/i18n` (`t`) localizes the idle message. `@api/error-codes` supplies `ERROR_CODES`.
- `src/modules/account/routes.ts` presumably registers this handler. The unit test `src/modules/account/tests/unit/get-refresh-token.test.ts` covers it.

## Notes
- Every refusal (unknown, expired, revoked or replayed token) returns the same 401. This keeps clients from telling the cases apart. The one exception is an idle-timeout, which returns the `SESSION_IDLE` code so the client can show "signed out for inactivity".
- Infrastructure outages return 503 rather than 401, because the client treats 401 as a definitive sign-out.
- Returning the rotated cookie in the same response means the client does not have to rely on the grace window to survive presenting a superseded token.
- The handler returns a promise chain rather than being `async`. The promise it returns resolves after the response has been sent.
- An absent cookie is not handled in the controller. `refreshAccessToken` records it as one of its own outcomes.
