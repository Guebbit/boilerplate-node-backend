---
source: src/modules/account/controllers/post-login-restore.ts
sha256: 502c9780b81617f3a48551beb9fa2942e91592e5bf4963359d54bce21a478424
generated_at: 2026-11-08T04:05:31.269846+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login-restore.ts

## Purpose

Handler for `POST /account/login/restore`, the final step of signing in with an account that is inside its deletion grace period. It validates (redeems) the deletion challenge to cancel the pending deletion, then mints a session identical in shape to a normal `postLogin` success.

## Key elements

- **`postLoginRestore(request, response)`** – The sole export. Parses the `LoginRestoreBody`, resolves the deletion challenge (from body or from the OAuth cookie), calls `accountService.restoreAtSignIn`, and on success chains: `issueSession` → `recordLoginSuccess` → `withAccountView` → destroy challenge cookie → `rememberDevice` → `successResponse<AuthTokens>`.

## Relationships

- **`../services` (`accountService.restoreAtSignIn`)** – Validates and redeems the deletion challenge; returns `{ user, amr }` on success or a refusal.
- **`../session/session` (`issueSession`)** – Creates the auth token pair for the restored user.
- **`../session/account-view` (`withAccountView`)** – Wraps the token body with the user's display metadata.
- **`../session/device-cookie` (`rememberDevice`)** – Sets the "remember this device" cookie using the user's email.
- **`../session/login-observability` (`recordLoginSuccess`)** – Emits a login-success event for the user.
- **`../oauth/deletion-redirect` (`readDeletionChallengeCookie`, `destroyDeletionChallengeCookie`)** – Falls back to the cookie when the body omits `challenge` (OAuth flow); destroys the cookie after a successful restore.
- **`@infrastructure/http/controller` (`parseBody`, `refused`)** – Zod validation of the request body and early-return on service refusals.
- **`@infrastructure/http/response` (`successResponse`, `rejectResponse`)** – Standard HTTP reply helpers.
- **`@infrastructure/http/errors` (`rejectDatabaseError`)** – Maps unexpected errors to a safe 500 response.
- **`@infrastructure/http/request` (`callerContextOf`)** – Extracts IP/UA context passed to the service call.
- **`@infrastructure/i18n` (`t`)** – Localizes the error message when no valid challenge is present.
- **`../routes`** – Registers this handler at the `POST /account/login/restore` path.

## Notes

- **Concurrency guard:** `provedAt = Date.now()` is captured *before* `restoreAtSignIn` is awaited. The intent is that if a password change lands in the window, the session is minted with a `provedAt` that predates it, causing downstream auth checks to reject the login.
- **Dual challenge source:** `parsed.challenge` is optional; when absent the controller falls back to the deletion-challenge cookie set by the OAuth redirect flow. Both paths converge on the same `challenge` string.
- **Cookie cleanup is one-shot:** `destroyDeletionChallengeCookie` is called only on the success path; a failed restore leaves the cookie intact so the user can retry.
- **No `async/await`:** The handler uses `.then/.catch` chaining rather than top-level `await`, consistent with the surrounding controller style.
