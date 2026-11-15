---
source: src/modules/account/controllers/post-login.ts
sha256: cece2a55d5b60d0a83be0898a746330ae5be8cda239b88bb726061a1ba3c3b78
generated_at: 2026-11-14T18:33:23.867425+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login.ts

## Purpose

The `POST /account/login` controller. It authenticates a user's credentials via `accountService.login`, then branches into one of three outcomes: a 2FA challenge, a deletion-grace claim, or a full session issue (refresh cookie + short-lived access token). Success/failure metrics, audit logging, and analytics are emitted here in the controller rather than in the service layer, so that 422s raised *before* the credential check still appear in the failure trail.

## Key elements

- **`postLogin(request, response)`** — the sole export. Parses `remember`/`transport`, delegates credential checking to `accountService.login`, then dispatches the appropriate response branch.
- **`rememberSchema`** — a Zod object (`remember: RememberTier?`, `transport: SESSION_TRANSPORTS?`) used to validate the non-secret cookie-configuration fields *before* the credential check, preventing an unknown tier from silently producing a cookie with no lifetime.
- **`provedAt`** — captured via `Date.now()` before the async credential check so that a concurrent password change invalidates the session.
- **Three response branches** (in order):
  1. `data.twoFactorEnabledAt` → `buildLoginChallenge` returns a short-lived 2FA challenge; no cookies or access token are set.
  2. `isRestorable(data)` → `buildDeletionPending` returns a claim for the deletion-grace window.
  3. Normal → `issueSession` mints tokens/cookies, then `recordLoginSuccess`, `withAccountView`, and `rememberDevice` complete the response.
- **Error path** — `.catch` funnels to `rejectDatabaseError`; deliberately does **not** call `recordLoginFailure` because a post-auth infrastructure error is not a rejected login.

## Relationships

- **`src/modules/account/services/index.ts`** — provides `accountService.login`, the credential check that returns either a refusal or the user document.
- **`src/modules/account/services/deletion-sign-in.ts`** — exports `buildDeletionPending`, which constructs the deletion-grace claim payload.
- **`src/modules/account/services/two-factor-challenge.ts`** — exports `buildLoginChallenge`, which constructs the 2FA challenge payload.
- **`src/modules/account/session/session.ts`** — exports `issueSession`, which mints the refresh token, sets transport-specific cookies, and produces the access token.
- **`src/modules/account/session/account-view.ts`** — exports `withAccountView`, which wraps the issued session into the `LoginOutcome` response body.
- **`src/modules/account/session/device-cookie.ts`** — exports `rememberDevice`, which marks the caller's browser as familiar for the account (defeats attacker-induced lockouts).
- **`src/modules/account/session/login-observability.ts`** — exports `recordLoginSuccess` / `recordLoginFailure`, the login outcome metric/audit events.
- **`src/modules/account/session/strategy.ts`** — exports `SESSION_TRANSPORTS`, the enum of valid cookie transports used in `rememberSchema`.
- **`src/modules/account/domain/session-proof.ts`** — exports `AMR`, the authentication-method reference used to tag the session proof.
- **`src/modules/users/authenticatable.ts`** — exports `isRestorable`, the predicate for the deletion-grace branch.
- **`src/infrastructure/http/controller.ts`** — provides `parseBody` and `refused`, generic helpers for Zod-parsing sub-fields and short-circuiting on service refusals.
- **`src/infrastructure/http/response.ts`** — provides `successResponse`, which writes the JSON success envelope.
- **`src/infrastructure/http/errors.ts`** — provides `rejectDatabaseError`, which maps thrown errors to appropriate HTTP responses in the catch block.
- **`src/modules/account/routes.ts`** — wires `postLogin` to the `POST /account/login` route.
- **`src/infrastructure/adapters/logger.ts`** — consumed transitively by the observability and service modules for structured logging.

## Notes

- **Express 5 body quirk:** `request.body` is typed `LoginRequest | undefined` because Express 5 leaves it `undefined` (not `{}`) when no body parser matched the content-type. The `request.body ?? {}` guard converts that to an empty body so `accountService.login` raises its own 422 uniformly.
- **Body is passed whole, not pre-parsed:** `remember` and `transport` *are* parsed eagerly (they affect cookie lifetime and an unknown tier must not slip through), but the rest of the body is forwarded as `unknown` to the service. This ensures a 422 for a malformed body arrives *after* `recordLoginFailure` has been called, keeping the attempt in the audit trail.
- **No `recordLoginFailure` in the catch block:** a database or token-minting error after successful authentication is not a "rejected login"; recording it as one would be misleading.
- **`provedAt` is captured before the async call:** if the password is changed during the login request, the session is refused on the `withAccountView` / session-validation step downstream.
