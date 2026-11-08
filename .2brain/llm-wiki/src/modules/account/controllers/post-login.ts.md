---
source: src/modules/account/controllers/post-login.ts
sha256: 164fa89f70a7d3abdc0ca974e53cf14af32f0dc807ed2783cf198974178c6bb0
generated_at: 2026-11-08T04:05:48.474959+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login.ts

## Purpose

The HTTP handler for `POST /account/login`. It reads the request body, validates the "remember me" tier, delegates credential checking to `accountService.login`, then — for a successful, non-2FA, non-pending-deletion result — mints a full session (refresh cookie, access token, account view). Success/failure login metrics are emitted here in the controller rather than in the service layer.

## Key elements

- **`postLogin(request, response)`** – The sole export. Express 5 handler for `POST /account/login`. Branches on the service result into: rejected login (401), 2FA challenge (200, no session), deletion-pending claim (200, no session), or full session issuance (200 + cookies). Catches downstream errors via `rejectDatabaseError`.
- **`rememberSchema`** – Zod object schema validating `remember` (a `RememberTier` enum) and `transport` (a `SESSION_TRANSPORTS` enum), both optional. Used by `parseBody` to reject unknown tiers with 422 before any credential work.

## Relationships

- **`src/modules/account/services/index.ts`** – Imports `accountService` (credential check, `buildDeletionPending`) and `twoFactorService` (`buildLoginChallenge`).
- **`src/modules/account/session/session.ts`** – Calls `issueSession` to mint the refresh token, cookies, and short-lived access token.
- **`src/modules/account/session/account-view.ts`** – Wraps the issued session payload with `withAccountView` before the HTTP response.
- **`src/modules/account/session/device-cookie.ts`** – Calls `rememberDevice` after a completed login to mark the browser as familiar for lockout purposes.
- **`src/modules/account/session/login-observability.ts`** – Calls `recordLoginFailure` / `recordLoginSuccess` around the service result.
- **`src/modules/account/session/strategy.ts`** – Imports `SESSION_TRANSPORTS` for the `rememberSchema` enum.
- **`src/modules/account/domain/session-proof.ts`** – Imports `AMR` constants (`AMR.password`) used in the auth-methods claim and the 2FA / deletion-pending challenges.
- **`src/modules/users/index.ts`** – Imports `isRestorable` to detect deletion-grace accounts.
- **`src/infrastructure/http/controller.ts`** – Uses `parseBody` (tier validation) and `refused` (unified 401 check on the service result).
- **`src/infrastructure/http/response.ts`** – Uses `successResponse` for every 200 reply.
- **`src/infrastructure/http/errors.ts`** – Uses `rejectDatabaseError` in the `.catch` to map unhandled errors to safe HTTP responses.
- **`src/modules/account/routes.ts`** – Registers `postLogin` as the handler for the `POST /account/login` route.

## Notes

- **Express 5 `body === undefined`:** When no body-parser matches the `Content-Type`, Express 5 leaves `request.body` as `undefined` (not `{}`). The `request.body ?? {}` destructure guard is load-bearing; removing it turns a missing body into a synchronous `TypeError` before the service can return its 422.
- **Observability lives in the controller, not the service:** A 422 raised *here* (e.g. bad `remember` tier) would fire before `recordLoginFailure`, dropping the attempt from the audit trail. The service's own 422 (malformed password shape) arrives *after* `recordLoginFailure` and is recorded. This is the stated reason the metrics calls are placed at this layer.
- **`provedAt` is captured before the hash check:** If the password is changed concurrently during the request, the stale `provedAt` causes the session to be refused rather than minted against a now-different secret.
- **2FA and deletion-pending paths mint no session:** They return a 200 with a challenge/claim body but set no cookies and record no login. `postLoginTwoFactor` or the restore endpoint completes the flow.
- **`rememberDevice` is post-login only:** It marks the browser familiar so an attacker-triggered lockout cannot keep the legitimate owner signed out. It is called only on the full-session path, not on 2FA or deletion-pending branches.
