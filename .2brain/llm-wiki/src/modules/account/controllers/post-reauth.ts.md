---
source: src/modules/account/controllers/post-reauth.ts
sha256: 7c6e443b89fff5f91351a1cc195a5af4920b062301362cbd36745420d74da1ad
generated_at: 2026-10-14T08:36:35.948394+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reauth.ts

## Purpose

HTTP adapter for `POST /account/reauth`. When a client receives a `401 REAUTH_REQUIRED` challenge (issued by `requireFreshAuth`), it calls this endpoint to re-prove identity (password or OTP code) and obtain a session with a fresh `auth_time` — without terminating the existing session. All business logic lives in `accountService.reauth`; this file only parses input, calls the service, re-mints the session, and shapes the HTTP response.

## Key elements

- **`postReauth`** (exported) — Express handler that:
  1. Reads the caller's user id from `request.authContext!` (guaranteed present by `isAuth` middleware).
  2. Validates the body against the `ReauthBody` Zod schema; on failure returns 422 via `rejectValidation`.
  3. Calls `accountService.reauth(id, data, callerContextOf(request))`.
  4. On a `refused` result, short-circuits with an error response.
  5. Calls `reissueSession` to mint a new session carrying only the `amr` methods proven *in this call* (e.g. `otp` for a code).
  6. Returns `200` with `AuthTokens` and an i18n success message, or `500` on any downstream error.
- **`authReauthTotal`** — Prometheus counter incremented on every success or failure outcome.

## Relationships

- **`src/modules/account/services/index.ts`** — imports `accountService`; calls its `.reauth()` method for the actual credential check.
- **`src/modules/account/session/session.ts`** — imports `reissueSession`; mints the replacement session with the service-supplied `amr`.
- **`src/modules/account/metrics.ts`** — imports `authReauthTotal` counter; increments on success/failure paths.
- **`src/modules/account/routes.ts`** — registers this handler on the `POST /account/reauth` route (wired behind `isAuth`).
- **`src/infrastructure/http/controller.ts`** — imports `rejectValidation` (422 helper) and `refused` (shared refusal check).
- **`src/infrastructure/http/errors.ts`** — imports `rejectDatabaseError` for the `.catch` fallback.
- **`src/infrastructure/http/request.ts`** — imports `callerContextOf` to extract IP/UA context passed to the service.
- **`src/infrastructure/http/response.ts`** — imports `successResponse` to build the 200 JSON envelope.
- **`src/infrastructure/i18n/index.ts`** — imports `t` for the success-message lookup key `account.reauth.success`.
- **`src/types/index.ts`** — imports `ReauthRequest` and `AuthTokens` for type annotations.

## Notes

- **`amr` is intentionally narrow.** The new session's `amr` reflects *only* what this call proved (e.g. `otp` if a code was supplied). Nothing is inherited from the original login's `amr`.
- **A failed `reissueSession` must 500, not 200.** Unlike `postPasswordChange` (where a durable write already succeeded), here the *entire purpose* is the fresh `auth_time` token. A 200 without a valid token would falsely signal that the step-up challenge was cleared. The `.then` chain is structured so a `reissueSession` rejection falls through to the outer `.catch`.
- **No writes in the service call.** `accountService.reauth` only compares the password/code; it does not revoke the old session or persist anything. The session re-mint is the sole mutation.
