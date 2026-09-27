---
source: src/modules/account/controllers/post-reauth.ts
sha256: 926a893e4ed785f09ca18a5d8a3974c9bf70adff909c43553274d8ec0faed08f
generated_at: 2026-09-27T14:25:41.606003+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reauth.ts

## Purpose

Thin HTTP adapter for `POST /account/reauth`. When `requireFreshAuth` issues a `401 REAUTH_REQUIRED` step-up challenge, the client calls this endpoint to re-prove the password and obtain a freshly minted session (with an updated `auth_time`) without terminating the existing one. The controller delegates the actual password check to `accountService.reauth` and session re-minting to `issueSession`.

## Key elements

- **`postReauth(request, response)`** — the sole export; the Express handler. It:
  - Reads the caller id from `request.authContext` (set by `isAuth` middleware).
  - Validates the JSON body against the `ReauthBody` zod schema; rejects via `rejectValidation` on failure.
  - Calls `accountService.reauth(id, password, callerContext)`; short-circuits with `refused` if the service declines.
  - On success, calls `issueSession(response, id)` to re-mint the session, then responds `200` with the token and an i18n message.
  - Catches any downstream error and delegates to `rejectDatabaseError`.
  - Increments the `authReauthTotal` Prometheus counter on **every** exit path (validation failure, refused, success, catch).

## Relationships

- **`@infrastructure/http/controller`** — imports `rejectValidation` and `refused` for structured rejection responses.
- **`@infrastructure/http/errors`** — imports `rejectDatabaseError` to format unexpected errors into a `500`.
- **`@infrastructure/http/request`** — imports `callerContextOf` to extract the client IP / user-agent forwarded to the service layer.
- **`@infrastructure/http/response`** — imports `successResponse` for the happy-path `200`.
- **`@infrastructure/i18n`** — imports `t` to translate the success message key `account.reauth.success`.
- **`@types`** — imports `ReauthRequest` (body shape) and `AuthTokens` (response payload) types.
- **`../services` (accountService)** — calls `accountService.reauth` to compare the password; the service performs no writes or revocations.
- **`../session/session`** — calls `issueSession` to re-mint the session token with a fresh `auth_time`.
- **`../metrics`** — imports and increments the `authReauthTotal` counter.
- **`../routes`** — registers `postReauth` as the handler for the `POST /account/reauth` route (behind `isAuth`).

## Notes

- `request.authContext!` uses a non-null assertion; safety is guaranteed by the `isAuth` middleware upstream, not by a runtime check here.
- An `issueSession` failure is **deliberately not** caught inside the `.then` chain. It must bubble to the outer `.catch` and surface as `500`, because a `200` with no token would falsely signal that the step-up challenge was cleared when no fresh session was actually issued.
- This is the third caller of `issueSession` (the others being `postLogin` and `postPasswordChange`), which is why that function was extracted into a shared module.
- `accountService.reauth` is read-only (password comparison); it writes nothing and revokes no session. All durable state changes happen in `issueSession`.
