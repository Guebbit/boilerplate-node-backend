---
source: src/modules/account/controllers/post-2fa-backup-codes.ts
source_sha256: d68cf8c63959b48fd93c72119b70807e78ab5087a0d54c6171e7fa0f6b32a896
context_sha256: 264eaf419bfd22f25c1a4dac1b86bf0cdf18c0fc37e8b1359d0c2ba84d186cb5
generated_at: 2026-11-22T03:22:49.485319+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-2fa-backup-codes.ts

## Purpose
Express controller for `POST /account/2fa/backup-codes`. It is a thin HTTP adapter over `twoFactorService.regenerateBackupCodes`. The endpoint mints a fresh set of ten backup codes and discards the old ones. Per the doc comment, it requires fresh critical auth and a valid 2FA code, for the same reasons `post2faDisable` gives.

## Key elements
- `post2faBackupCodes(request, response)` is the only export. Its steps are:
  1. Read the user `id` from `request.authContext!`.
  2. Validate `request.body` against `RegenerateBackupCodesBody` (from `@api/schemas.zod`) using `parseBody`. If validation fails, it increments the failure metric and returns. `parseBody` is passed `response`, so it presumably writes the error response itself.
  3. Call `twoFactorService.regenerateBackupCodes(id, body.code, callerContextOf(request))`.
  4. If `refused(response, result)` is true, increment the failure metric and return.
  5. Otherwise increment the success metric and send `successResponse<TwoFactorBackupCodesRegenerated>(response, result.data, 200)`.
  6. Any rejected promise goes to `catchAs(response, 'post2faBackupCodes')`.

## Relationships
- `src/infrastructure/http/controller.ts` provides `parseBody`, `refused` and `catchAs`. These handle validation, service-refusal and error handling.
- `src/infrastructure/http/request.ts` provides `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/response.ts` provides `successResponse`, which sends the 200 payload.
- `src/modules/account/services/index.ts` exports `twoFactorService`, which holds the actual regeneration logic.
- `src/modules/account/metrics.ts` provides the `authTwoFactorBackupCodesRegenerateTotal` counter, labelled `status: 'success' | 'failure'`.
- `src/types/index.ts` provides the `TwoFactorCodeRequest` request body type and the `TwoFactorBackupCodesRegenerated` response type.
- `src/modules/account/routes.ts` is the neighbor that presumably mounts this handler. The file itself does not show the route wiring or the auth middleware.

## Notes
- The handler uses `request.authContext!`, a non-null assertion. It relies on upstream auth middleware having populated it.
- The failure metric is incremented in two places (body validation and service refusal). Thrown or rejected errors, which go to `catchAs`, do not increment either metric label.
- The "fresh critical auth" requirement is not enforced in this file. It is documented in the comment and presumably enforced elsewhere (middleware or service).
