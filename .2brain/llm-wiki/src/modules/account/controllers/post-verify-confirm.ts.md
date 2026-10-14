---
source: src/modules/account/controllers/post-verify-confirm.ts
sha256: 565f22c2c301de21f6666d56b869dc5522811a963b38f20639a7e2cfd1aa6101
generated_at: 2026-10-14T08:37:54.674022+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-verify-confirm.ts

## Purpose

Handler for `POST /account/verify-confirm`. Receives a one-time email-verification token in the request body, validates it, atomically redeems it, and marks the account's email as verified. It is deliberately public (no auth middleware) because the token itself is the credential—same pattern as `reset-confirm` and `delete-confirm`.

## Key elements

- **`postVerifyConfirm(request, response)`** – The sole export. Validates the body with the `ConfirmEmailVerificationBody` Zod schema, calls `accountService.redeemLiveToken` to atomically spend the token, then calls `accountService.completeEmailVerification` on success. Emits `authEmailVerifyTotal` metrics (`success` / `failure`) on every path.
- **Find-then-spend pattern** – The "find" (read) step allows two simultaneous clicks to both pass; the atomic "spend" step picks a winner. The loser receives the same 422 "token not found" response as an invented token. This logic lives in `services/tokens.ts`.
- **`EMAIL_VERIFY_TOKEN_TYPE`** – Constant imported from `services/index` that scopes `redeemLiveToken` to email-verification tokens specifically.

## Relationships

- **`src/modules/account/services/index.ts`** – Provides `accountService` (both `redeemLiveToken` and `completeEmailVerification` calls) and the `EMAIL_VERIFY_TOKEN_TYPE` constant.
- **`src/modules/account/metrics.ts`** – Provides `authEmailVerifyTotal`, a Prometheus counter incremented on every success/failure outcome.
- **`src/infrastructure/http/controller.ts`** – Provides `rejectValidation` (Zod failure → 400) and `catchAs` (catches unexpected errors, logs, and returns 500).
- **`src/infrastructure/http/response.ts`** – Provides `successResponse` and `rejectResponse` for consistent response shaping.
- **`src/infrastructure/http/request.ts`** – Provides `callerContextOf(request)`, passed to `recordOneTimeTokenRejected` and `completeEmailVerification` for audit/telemetry context.
- **`src/infrastructure/i18n/index.ts`** – Provides `t()` for all user-facing messages (token-not-found, success).
- **`src/types/index.ts`** – Provides the `VerifyEmailConfirmRequest` type used to shape the Express `Request` generic.
- **`src/modules/account/routes.ts`** – Registers this handler on the `POST /account/verify-confirm` route (no auth guard).

## Notes

- **Public by design.** There is intentionally no session/JWT check; the token in the body *is* the authentication. Do not add an auth guard here.
- **Race safety is delegated.** The controller does not implement idempotency or locking. The "spend" atomicity is owned by `services/tokens.ts`; the controller simply propagates the `null` return as a 422.
- **`recordOneTimeTokenRejected` is called only in the "token not found" branch**, not in the validation-failure or catch branches—meaning a malformed body or an unexpected server error will *not* trigger that audit event.
- **Zod parse failure short-circuits before any service call**, so a bad request never touches the token store.
