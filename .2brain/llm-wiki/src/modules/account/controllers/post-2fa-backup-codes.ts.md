---
source: src/modules/account/controllers/post-2fa-backup-codes.ts
sha256: 3adec13e16aa7ce8eff70c9e07418fd3b80844608f33dff4a138a5ab846d9d93
generated_at: 2026-09-23T18:01:13.907204+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-backup-codes.ts

## Purpose

Thin HTTP adapter for `POST /account/2fa/backup-codes`. Validates the incoming body, delegates to `twoFactorService.regenerateBackupCodes`, and maps the service result (or a database error) onto an HTTP response. Exists to keep route wiring, validation, metrics, and response shaping separate from the domain service.

## Key elements

- **`post2faBackupCodes`** (exported) — Express handler. Reads `request.authContext.id`, safe-parses the body against `RegenerateBackupCodesBody`, calls `twoFactorService.regenerateBackupCodes(id, code, callerContext)`, then responds with 200 + i18n message on success, a structured error on service-level failure, or a 500 on unexpected DB error. Increments `authTwoFactorBackupCodesRegenerateTotal` with `status: 'success' | 'failure'` on every exit path.

## Relationships

- **`src/infrastructure/http/response.ts`** — `successResponse` and `rejectResponse` shape the HTTP reply.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseError` is the `.catch` fallback for unhandled DB exceptions.
- **`src/infrastructure/http/controller.ts`** — `rejectValidation` emits a 422 when the Zod schema rejects the body.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts client metadata (IP, user-agent, etc.) passed into the service call.
- **`src/infrastructure/i18n/index.ts`** — `t('account.two-factor.backup-codes-regenerated')` provides the localized success message.
- **`src/modules/account/services/index.ts`** — `twoFactorService.regenerateBackupCodes` is the sole domain call.
- **`src/modules/account/metrics.ts`** — `authTwoFactorBackupCodesRegenerateTotal` counter is incremented on every terminal path.
- **`src/modules/account/routes.ts`** — registers this handler on the `POST /account/2fa/backup-codes` route (behind auth middleware, which populates `request.authContext`).
- **`src/types/index.ts`** — provides the `TwoFactorCodeRequest` (body shape: `{ code: string }`) and `TwoFactorBackupCodesRegenerated` (response data) types.

## Notes

- **Dual authentication requirement.** The endpoint demands *both* a valid session (`authContext`) *and* a one-time 2FA code in the body. The docblock explicitly references the same rationale as `delete2fa`. Missing the code yields a service-level failure, not a validation error.
- **Non-null assertion on `authContext`.** `request.authContext!` assumes the route is always behind auth middleware; if that contract is ever broken the handler will throw a TypeError rather than a clean 401.
- **Returns 200, not 201.** Regeneration is treated as a state update, not resource creation.
- **Metrics triple-increment.** The counter is touched in three distinct code paths (validation reject, service reject, success) to capture failure rate at the controller boundary, independent of what the service logs internally.
