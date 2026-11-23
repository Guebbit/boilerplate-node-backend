---
source: src/modules/account/controllers/post-reauth.ts
source_sha256: 81e0cf913889ae537f44471b2183bfeda3d59ed72f06b5f326477b20cf0ed520
context_sha256: 354591935e079a8a8feaf05d118b8c683e9fe418c9f600dedeaf018ab9594f63
generated_at: 2026-11-22T03:26:45.601432+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-reauth.ts

## Purpose
Express controller for `POST /account/reauth`, a thin HTTP adapter over `accountService.reauth`. It answers a `401 REAUTH_REQUIRED` challenge from `requireFreshAuth`: the caller re-proves their identity (password, or a mailed code for accounts without a password), and their session is re-minted with a fresh `auth_time` without ending it.

## Key elements
- `postReauth(request, response)` — the only export. Flow:
  1. Reads `id` from `request.authContext!` (guaranteed by the `isAuth` middleware).
  2. Validates the body with `parseBody(ReauthBody, ...)`. On failure it increments `authReauthTotal{status:'failure'}` and returns.
  3. Calls `accountService.reauth(id, parsed, callerContextOf(request))`.
  4. If `refused(response, result)` is true, it increments the failure metric and returns.
  5. Otherwise calls `reissueSession(request, response, id, { amr: result.data.amr })`, increments the success metric, and sends `successResponse<AuthTokens>(response, issued, 200)`.
  6. A trailing `.catch` increments the failure metric and calls `rejectDatabaseError(response, 'postReauth', error)`.

## Relationships
- `src/modules/account/services/index.ts` — exports `accountService`, whose `reauth` method performs the credential check and returns the `amr` that was proven.
- `src/modules/account/session/session.ts` — `reissueSession` mints the new session and tokens. The doc comment says it is the same tail `postLogin` and `postPasswordChange` end with.
- `src/modules/account/metrics.ts` — `authReauthTotal` counter, labelled by `status`.
- `src/infrastructure/http/controller.ts` — `parseBody` (body validation) and `refused` (checks the service result and writes the refusal response).
- `src/infrastructure/http/request.ts` — `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts` — `successResponse` writes the 200 response.
- `src/infrastructure/http/errors.ts` — `rejectDatabaseError` handles thrown errors.
- `src/types/index.ts` — `ReauthRequest` and `AuthTokens` types.
- `src/modules/account/routes.ts` — presumably mounts this handler. Mounting is not visible in this file.

## Notes
- The new session's `amr` contains only what this call proved. A code in the body earns `otp`, and nothing is carried over from the login.
- A failed re-mint must propagate to the outer `.catch` and return 500. `accountService.reauth` only compares credentials and writes or revokes nothing, so a 200 without a token would wrongly claim the step-up challenge was cleared. This differs from `postPasswordChange`'s re-mint step, where durable changes have already happened.
- The failure metric is incremented at each exit path (validation, refusal, thrown error). Success is counted only after the re-mint succeeds.
- `Request<unknown, unknown, ReauthRequest>` types the body, but the body is still validated at runtime with `ReauthBody` (imported from `@api/schemas.zod`).
