---
source: src/modules/account/controllers/post-2fa-backup-codes.ts
sha256: d68cf8c63959b48fd93c72119b70807e78ab5087a0d54c6171e7fa0f6b32a896
generated_at: 2026-11-08T04:03:03.073628+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-backup-codes.ts

## Purpose

Thin HTTP adapter for `POST /account/2fa/backup-codes`. Validates the incoming request body (which must include a valid two-factor code), delegates to `twoFactorService.regenerateBackupCodes` to mint a fresh set of ten backup codes, and returns the result or an error. It exists to keep HTTP concerns (body parsing, response shaping, metrics) separate from the domain service.

## Key elements

- **`post2faBackupCodes`** (default export) — The sole handler. Accepts a pre-authenticated Express `Request` (body typed as `TwoFactorCodeRequest`) and a `Response`. Flow:
  1. Extracts `id` from `request.authContext`.
  2. Parses the body with `RegenerateBackupCodesBody` (Zod schema from `@api/schemas.zod`); on failure increments the metrics counter with `status: 'failure'` and returns.
  3. Calls `twoFactorService.regenerateBackupCodes(id, body.code, callerContextOf(request))`.
  4. On a "refused" result, increments the failure metric and returns.
  5. On success, increments the success metric and sends `result.data` as a 200 `TwoFactorBackupCodesRegenerated` payload.
  6. Any thrown error is funnelled through `catchAs(response, 'post2faBackupCodes')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Source of `parseBody`, `refused`, and `catchAs` helpers used for body validation, result inspection, and error serialization.
- **`src/infrastructure/http/request.ts`** — Source of `callerContextOf`, which extracts the caller's IP/user-agent context and passes it into the service call.
- **`src/infrastructure/http/response.ts`** — Source of `successResponse`, used to serialize the `TwoFactorBackupCodesRegenerated` payload.
- **`src/modules/account/metrics.ts`** — Source of `authTwoFactorBackupCodesRegenerateTotal`, a Counter incremented on every request (tagged `success` or `failure`).
- **`src/modules/account/services/index.ts`** — Source of `twoFactorService`, whose `regenerateBackupCodes` method performs the actual code rotation.
- **`src/types/index.ts`** — Source of the `TwoFactorCodeRequest` (body type) and `TwoFactorBackupCodesRegenerated` (response data type) types.
- **`src/modules/account/routes.ts`** — Expected to wire this handler onto the `POST /account/2fa/backup-codes` route (neighbor in the dependency graph; not imported by this file).

## Notes

- The handler requires a valid 2FA code in the body *in addition to* an authenticated session — the same "fresh critical auth" pattern noted in the code comment (mirrors `post2faDisable`). Forgetting to include `body.code` will cause the service to reject the request.
- The metrics counter is incremented **inline** (not via middleware), so it fires on both schema-parse failure and service-level refusal; a thrown exception (caught by `catchAs`) does **not** increment the counter.
- `request.authContext!` uses a non-null assertion, relying on the auth middleware running before this controller.
