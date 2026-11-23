---
source: src/modules/account/controllers/post-login-restore.ts
source_sha256: 502c9780b81617f3a48551beb9fa2942e91592e5bf4963359d54bce21a478424
context_sha256: 86c73e789d6a22b57d75fc9fa6e903b8a80468164a0c8ff06a6e5e718c50d08f
generated_at: 2026-11-22T03:25:21.611907+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-login-restore.ts

## Purpose
Express controller for `POST /account/login/restore`, the final step of a sign-in by an account that is in its deletion grace period. It redeems the deletion "claim check" (challenge), which cancels the pending deletion, and then issues a session the same way `postLogin` does.

## Key elements
- **`postLoginRestore(request, response)`**: the only export. It answers the `{ deletionPending: true, challenge }` body returned by `POST /account/login` or `/login/2fa`. Flow:
  1. Validates the body with `LoginRestoreBody` via `parseBody`, and returns early if validation fails.
  2. Takes `challenge` from the body, falling back to the deletion-challenge cookie (the OAuth case). If neither is present, it responds 401 with `account.login.restore-challenge-invalid`.
  3. Captures `provedAt = Date.now()` before the restore. The inline comment says this is so a password changed during the restore refuses the login.
  4. Calls `accountService.restoreAtSignIn(challenge, callerContextOf(request))`, and returns if `refused(response, result)`.
  5. Calls `issueSession` with `remember`, `amr`, `provedAt` and `transport`.
  6. Calls `recordLoginSuccess`, then `withAccountView` to build the body.
  7. Destroys the challenge cookie, calls `rememberDevice` with the user's email, and sends `successResponse<AuthTokens>` with status 200.
  8. Any thrown error goes to `rejectDatabaseError(response, 'postLoginRestore', error)`.

## Relationships
- **`../services`** (`src/modules/account/services/index.ts`): exports `accountService`, whose `restoreAtSignIn` performs the actual restore and yields `{ user, amr }`.
- **`../session/session`**: `issueSession` mints the session.
- **`../session/account-view`**: `withAccountView` decorates the issued session with account info.
- **`../session/device-cookie`**: `rememberDevice` sets the device cookie.
- **`../session/login-observability`**: `recordLoginSuccess` records the successful login.
- **`../oauth/deletion-redirect`**: `readDeletionChallengeCookie` and `destroyDeletionChallengeCookie` handle the OAuth path's challenge cookie.
- **`@infrastructure/http/*`**:
  - `controller`: `parseBody` and `refused`.
  - `response`: `successResponse` and `rejectResponse`.
  - `errors`: `rejectDatabaseError`.
  - `request`: `callerContextOf`.
- **`@infrastructure/i18n`**: `t` supplies the localized 401 message.
- The route wiring lives in `src/modules/account/routes.ts`, which is a graph neighbor. The file content itself shows no registration.

## Notes
- The handler is not `async`. It returns early with `undefined` on validation failure or refusal, and otherwise returns a promise chain.
- The challenge cookie is destroyed only after the session and response body have been built successfully.
- `provedAt` is taken before the restore call and passed to both `issueSession` and `withAccountView`.
- The `LoginRestoreBody` schema and the `LoginRestoreRequest` and `AuthTokens` types come from the `@api/schemas.zod` and `@types` import aliases.
