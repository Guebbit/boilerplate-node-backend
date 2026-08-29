# src/modules/account/controllers/post-verify-confirm.ts

## Purpose

Handler for `POST /account/verify-confirm`. It validates a one-time email-verification token from the request body, atomically spends it, and marks the account's email as verified. The endpoint is intentionally public (no session auth) because the token in the body *is* the credential — the visitor following the emailed link is not logged in.

## Key elements

- **`postVerifyConfirm(request, response)`** — the sole export; an Express route handler typed with `VerifyEmailConfirmRequest`.
- **`ConfirmEmailVerificationBody.safeParse`** — Zod validation of the body; failures short-circuit via `rejectValidation`.
- **`refuse()`** (inner helper) — returns a uniform `422` with the i18n string `account.verify.token-not-found` and increments the failure metric. Used for every negative path (token not found, token already spent, or spent by a concurrent request).
- **`accountService.findLiveToken(EMAIL_VERIFY_TOKEN_TYPE, token)`** — read-only lookup; two concurrent clicks can both pass this step.
- **`accountService.spendLiveToken(user, token)`** — atomic spend; only one concurrent caller receives `true`. The loser falls through to `refuse()`.
- **`accountService.completeEmailVerification(user, callerContextOf(request))`** — finalises the verification (sets the flag, etc.) after a successful spend.
- **`authEmailVerifyTotal`** — Prometheus counter (`success` / `failure`) incremented on every outcome.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `rejectValidation`, the standard 422 shape for Zod parse failures.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf`, which extracts caller metadata (IP, UA, etc.) to pass into `completeEmailVerification`.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` and `rejectResponse` used for the happy-path and refusal replies.
- **`src/infrastructure/i18n/index.ts`** — provides `t()` for the user-facing strings (`account.verify.token-not-found`, `account.verify.success`).
- **`src/modules/account/metrics.ts`** — source of `authEmailVerifyTotal`.
- **`src/modules/account/services/index.ts`** — source of `accountService` (the token + verification domain logic) and `EMAIL_VERIFY_TOKEN_TYPE`.
- **`src/types/index.ts`** — source of the `VerifyEmailConfirmRequest` type used in the handler signature.
- **`src/modules/account/routes.ts`** — registers this handler on the `POST /account/verify-confirm` path.

## Notes

- **Race handling:** The "find → spend" sequence means two simultaneous clicks both pass `findLiveToken`; only one wins `spendLiveToken`. The loser sees the same `422 token-not-found` as a completely fabricated token. This is deliberate (see `services/tokens.ts`) so an attacker cannot distinguish "already used" from "never existed."
- **No auth middleware** is expected upstream; the token is the sole credential. Do not add session checks without revisiting the public-link design.
- All error paths (bad body, missing token, spent token, internal error) increment the **same** `authEmailVerifyTotal` counter with `status: 'failure'`; only the final `completeEmailVerification` success path records `status: 'success'`.
