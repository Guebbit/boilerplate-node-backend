---
source: src/modules/account/controllers/post-2fa-backup-codes.ts
sha256: 15e06daf56ac45c13bc4e27f19339ee058c86eefba6a82e711515c2dbbe35205
generated_at: 2026-09-27T14:23:46.336801+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-backup-codes.ts

## Purpose

Thin HTTP adapter for `POST /account/2fa/backup-codes`. It validates the request body, delegates to `twoFactorService.regenerateBackupCodes`, and formats the success/failure response. Requires both critical auth and a valid 2FA code before allowing backup-code regeneration.

## Key elements

- **`post2faBackupCodes(request, response)`** — The sole export. Parses the body against the `RegenerateBackupCodesBody` Zod schema, calls the service, and emits either a validation rejection, a domain-level refusal, or a `200` success with the new code set.
- **Body validation** — Uses `RegenerateBackupCodesBody.safeParse`; on failure, increments the failure metric and calls `rejectValidation`.
- **Success path** — Returns the service's `TwoFactorBackupCodesRegenerated` payload with a 200 and the i18n key `account.two-factor.backup-codes-regenerated`.
- **Error path** — `.catch(catchAs(response, 'post2faBackupCodes'))` normalises unhandled rejections into a standard HTTP error.

## Relationships

- **`@infrastructure/http/controller`** — Supplies `rejectValidation`, `refused`, and `catchAs`, the standard helpers for shaping 4xx/5xx responses and normalising errors.
- **`@infrastructure/http/request`** — `callerContextOf(request)` extracts the caller context (IP, user-agent, etc.) forwarded to the service.
- **`@infrastructure/http/response`** — `successResponse` serialises the payload with status code and i18n message.
- **`@infrastructure/i18n`** — `t()` resolves the human-readable success message.
- **`../services`** — Imports `twoFactorService`; this controller is its only HTTP-facing caller for `regenerateBackupCodes`.
- **`../metrics`** — `authTwoFactorBackupCodesRegenerateTotal` is incremented on both success and failure branches.
- **`../routes`** — Registers this handler at the `POST /account/2fa/backup-codes` path.
- **`@types`** — Provides the `TwoFactorBackupCodesRegenerated` and `TwoFactorCodeRequest` types used for response typing and request body shape.

## Notes

- The route requires **two** gates: the session must be critically authenticated *and* the body must carry a valid 2FA code (same pattern as `delete2fa`). A missing/expired code is a domain-level refusal, not a validation error.
- Metrics are incremented inside the `.then` callback, meaning they fire **after** the service resolves. If the service throws, only the `catch` branch runs and no metric is recorded — the failure metric in the `refused` path covers the "valid request, rejected domain logic" case.
- The function is synchronous in signature but returns the promise chain implicitly; callers in `routes.ts` do not need to `.catch` again.
