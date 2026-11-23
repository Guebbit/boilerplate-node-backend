---
source: src/modules/account/controllers/post-login-2fa-send.ts
generated_at: 2026-11-22T03:24:50.149539+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-login-2fa-send.ts

## Purpose
Express controller for `POST /account/login/2fa/send`. It is a thin HTTP adapter over `twoFactorService.sendLoginCode`: it sends a fresh two-factor code (by mail or text) against a live login challenge. The endpoint is public, like the rest of the login flow, because the challenge token is the credential.

## Key elements
- `postLoginTwoFactorSend(request, response)` is the only export. It does the following:
  - Validates the body with `parseBody(SendTwoFactorCodeBody, ...)`. If parsing fails, `parseBody` has already written the response, so the handler records a failure metric with `method: 'unknown'` and returns.
  - Takes `method` from the parsed body.
  - Takes the challenge from `parsed.challenge`, or falls back to `readMfaChallengeCookie(request)`. If neither is present, it responds `401` with `t('account.two-factor.challenge-invalid')`.
  - Calls `twoFactorService.sendLoginCode(challenge, method, callerContextOf(request))`.
  - If `refused(response, result)` reports a refusal, it records a failure and returns. Otherwise it records success and replies `200` with `successResponse<TwoFactorDelivery>(response, result.data, 200)`.
  - On a thrown or rejected error, it records a failure and calls `rejectDatabaseError(response, 'postLoginTwoFactorSend', error)`.

## Relationships
- `src/types/index.ts` provides `TwoFactorSendRequest` (the request body type) and `TwoFactorDelivery` (the success payload type).
- `infrastructure/http/controller.ts` provides `parseBody` and `refused`.
- `infrastructure/http/response.ts` provides `successResponse` and `rejectResponse`.
- `infrastructure/http/errors.ts` provides `rejectDatabaseError`.
- `infrastructure/http/request.ts` provides `callerContextOf`, which builds the caller context passed to the service.
- `infrastructure/i18n` provides `t`, used for the localized 401 message.
- `services/index.ts` provides `twoFactorService`, which holds the actual send logic.
- `metrics.ts` provides `authTwoFactorCodeSentTotal`, a counter labelled by `method` and `status`.
- `oauth/mfa-redirect.ts` provides `readMfaChallengeCookie`, the cookie fallback for the challenge.
- `routes.ts` in the same module presumably mounts this handler. The file itself does not show this.

## Notes
- The request body schema `SendTwoFactorCodeBody` is imported from `@api/schemas.zod`.
- The cookie fallback for the challenge is the same one `postLoginTwoFactor` uses.
- Every outcome increments `authTwoFactorCodeSentTotal`. Validation failures use `method: 'unknown'`, since the method is not known until the body parses.
- The handler returns the promise chain, but every path (success, refusal, error) writes its own response.
