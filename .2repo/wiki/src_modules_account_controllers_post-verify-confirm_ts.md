# src/modules/account/controllers/post-verify-confirm.ts

## Purpose

Handles `POST /account/verify-confirm`: validates a one-time email-verification token in the request body, atomically spends it, and marks the account's email as verified. It is deliberately public (no auth middleware) because the token itself is the credential, mirroring the pattern used by `reset-confirm` and `delete-confirm`.

## Key elements

- **`postVerifyConfirm(request, response)`** – The sole export. Pipeline:
  1. Zod-parses the body via `ConfirmEmailVerificationBody`; on failure, returns a 422 validation error.
  2. Calls `accountService.findLiveToken(EMAIL_VERIFY_TOKEN_TYPE, token)` to locate the user.
  3. Calls `accountService.spendLiveToken(user, token)` — the atomic "spend" that resolves concurrent duplicate submissions.
  4. On successful spend, calls `accountService.completeEmailVerification(user, callerContextOf(request))` to persist the verified state.
  5. Responds with `successResponse` (200) or a uniform 422 refusal.
- **`refuse()`** (inner helper) – Single code path for every denial (token not found, already spent, user not found). Always emits a `failure` metric and returns the identical 422 body `t('account.verify.token-not-found')` to prevent token enumeration.

## Relationships

- **`src/modules/account/services/index.ts`** – Consumes `accountService` (`findLiveToken`, `spendLiveToken`, `completeEmailVerification`) and the `EMAIL_VERIFY_TOKEN_TYPE` constant.
- **`src/modules/account/routes.ts`** – Registers `postVerifyConfirm` as the handler for the `/account/verify-confirm` route.
- **`src/modules/account/metrics.ts`** – Emits `authEmailVerifyTotal` with `status: 'success'` or `'failure'` on every outcome.
- **`src/infrastructure/http/controller.ts`** – Uses `rejectValidation` for Zod parse failures.
- **`src/infrastructure/http/request.ts`** – Uses `callerContextOf` to extract IP/user-agent metadata passed into `completeEmailVerification`.
- **`src/infrastructure/http/response.ts`** – Uses `successResponse` and `rejectResponse` for all outbound replies.
- **`src/infrastructure/i18n/index.ts`** – Uses `t()` for localized success and refusal messages.
- **`src/types/index.ts`** – Imports `VerifyEmailConfirmRequest` as the typed body shape for the Express `Request` generic.

## Notes

- **Race safety by design:** Two simultaneous clicks both pass `findLiveToken` (a read), but only one wins the atomic `spendLiveToken`. The loser receives the exact same 422 response as a fabricated token — there is no "already spent" distinction.
- **No auth middleware expected:** The route is public; do not add session/token checks here. The body token *is* the authentication.
- **All refusals are intentionally indistinguishable** (422, same message). Do not add a separate "token expired" or "invalid format" status without revisiting this enumeration-prevention invariant.
- The `.catch(() => …)` at the bottom is a blanket 500 guard for unexpected service errors; it does not log the error itself (check whether `accountService` methods log internally).
