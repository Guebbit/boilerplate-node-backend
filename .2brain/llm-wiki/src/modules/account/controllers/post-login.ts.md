---
source: src/modules/account/controllers/post-login.ts
sha256: e3224de60bd46177aa1f02e020876207c65d387c2fb1cff0697174cc3158f66b
generated_at: 2026-10-29T02:30:36.458458+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login.ts

## Purpose

The `POST /account/login` controller. It validates the "remember me" tier, calls the account service to verify credentials, then branches into one of three outcomes: issue a full session (refresh cookie + short-lived access token), return a 2FA challenge, or surface a deletion-pending claim. All success/failure login metrics are recorded here at the controller level rather than inside the service.

## Key elements

- **`rememberSchema`** – Zod schema validating the optional `remember` (against `RememberTier` enum) and `transport` (against `SESSION_TRANSPORTS`) fields. Parsed before the credential check so a malformed tier is rejected with 422 without leaking anything about the password.
- **`postLogin`** – The exported Express handler. Destructures `email`/`password` from `request.body` (guarded with `?? {}` for Express 5's `undefined` body), parses the tier, records `provedAt`, then delegates to `accountService.login`. On success it either issues a session via `issueSession`, returns a 2FA challenge via `twoFactorService.buildLoginChallenge`, or returns a deletion-pending response via `accountService.buildDeletionPending`. On refusal it calls `recordLoginFailure`. Database/unexpected errors are funneled through `rejectDatabaseError`.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Provides `parseBody` (Zod validation helper that writes the 422 response) and `refused` (checks whether the service result is a rejection and writes the appropriate error response).
- **`src/infrastructure/http/errors.ts`** – `rejectDatabaseError` handles unexpected/database errors in the `.catch` branch.
- **`src/infrastructure/http/response.ts`** – `successResponse` writes the 200 body for all three success branches (full login, 2FA challenge, deletion-pending).
- **`src/modules/account/services/index.ts`** – `accountService.login` performs credential verification; `accountService.buildDeletionPending` builds the grace-period claim response; `twoFactorService.buildLoginChallenge` constructs the 2FA challenge payload.
- **`src/modules/account/session/session.ts`** – `issueSession` mints the refresh token, sets session cookies, and returns the short-lived access token.
- **`src/modules/account/session/strategy.ts`** – `SESSION_TRANSPORTS` enum is used to constrain the `transport` field in the body schema.
- **`src/modules/account/session/device-cookie.ts`** – `rememberDevice` marks the browser as "familiar" after a successful login so a lockout cannot keep the legitimate owner out.
- **`src/modules/account/session/login-observability.ts`** – `recordLoginSuccess` / `recordLoginFailure` emit audit, metrics, and analytics events.
- **`src/modules/account/domain/session-proof.ts`** – `AMR.password` is passed as the authentication method reference in both the session and the 2FA challenge.
- **`src/modules/users/index.ts`** – `isRestorable` checks whether the account is in its deletion-grace window.
- **`src/types/index.ts`** – Provides `RememberTier`, `LoginRequest`, and `LoginOutcome` type contracts.
- **`src/modules/account/routes.ts`** – Wires `postLogin` to the `POST /account/login` route.

## Notes

- **Metrics live here, not in the service.** A 422 raised at the controller level (e.g. bad `remember` tier) would return *before* `recordLoginFailure`, dropping the attempt from the audit trail. The service's own 422 (malformed password shape) arrives *after* the failure hook, so it is recorded. This is why tier validation is done at the controller while password-shape validation is left to the service.
- **Express 5 `request.body` can be `undefined`.** When no body parser matched the content-type, the body is `undefined` (not `{}` as in Express 4). The `?? {}` guard prevents a synchronous `TypeError` on destructure and lets the service produce its own 422.
- **`provedAt` is captured before the async login call.** A password changed during the hash verification must cause the login to be refused; the timestamp ensures the proof is bound to the pre-change state.
- **The `.catch` is deliberately not a login failure.** A database or token-minting error means the credential check may have succeeded, so it must not increment failure counters. It is routed through `rejectDatabaseError` instead.
- **2FA and deletion-pending both return 200.** The `LoginOutcome` discriminant tells the client which branch fired; no session or cookies are set in either case.
