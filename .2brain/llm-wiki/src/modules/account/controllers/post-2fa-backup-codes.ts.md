---
source: src/modules/account/controllers/post-2fa-backup-codes.ts
sha256: d68cf8c63959b48fd93c72119b70807e78ab5087a0d54c6171e7fa0f6b32a896
generated_at: 2026-10-29T02:28:02.087759+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-backup-codes.ts

## Purpose
HTTP handler for `POST /account/2fa/backup-codes`. Accepts a valid 2FA code, delegates to `twoFactorService.regenerateBackupCodes` to mint a fresh set of ten backup codes (discarding the old ones), and returns the new set. It exists as the thin Express adapter that wires routing, validation, metrics, and the service layer together.

## Key elements
- **`post2faBackupCodes`** – The sole export. Signature accepts `(Request<unknown, unknown, TwoFactorCodeRequest>, Response)`. Flow:
  1. Reads `request.authContext!.id` (guaranteed by upstream auth middleware).
  2. Validates the request body via `parseBody(RegenerateBackupCodesBody, …)`.
  3. Calls `twoFactorService.regenerateBackupCodes(id, body.code, callerContextOf(request))`.
  4. On success → `successResponse` with `TwoFactorBackupCodesRegenerated` (200).
  5. On validation failure, service refusal, or exception → increments the failure metric; `catchAs` serialises unexpected errors.

## Relationships
- **`src/infrastructure/http/controller.ts`** – Supplies `parseBody`, `refused`, and `catchAs` helpers used for validation, error-refusal, and exception serialisation.
- **`src/infrastructure/http/request.ts`** – Supplies `callerContextOf`, which extracts IP/UA metadata forwarded to the service.
- **`src/infrastructure/http/response.ts`** – Supplies `successResponse` for the happy-path JSON envelope.
- **`src/modules/account/services/index.ts`** – Exports `twoFactorService`, whose `regenerateBackupCodes` method performs the actual domain work.
- **`src/modules/account/metrics.ts`** – Exports the `authTwoFactorBackupCodesRegenerateTotal` counter, incremented with `{ status: 'success' | 'failure' }` on each outcome.
- **`src/modules/account/routes.ts`** – Registers this handler at the `/account/2fa/backup-codes` POST route (implied by the controller's role).
- **`src/types/index.ts`** – Provides the `TwoFactorCodeRequest` (body shape) and `TwoFactorBackupCodesRegenerated` (response data shape) types.

## Notes
- The endpoint requires **both** a valid session (critical auth) **and** a correct 2FA code in the body — the doc comment explicitly cites the same reasoning as `post2faDisable`.
- `request.authContext!` uses a non-null assertion; the controller assumes auth middleware has already run and populated it.
- Error handling uses a `.then`/`.catch` promise chain rather than `async`/`await`, consistent with the `catchAs` helper's expected shape.
- The body type in the Express generics is `TwoFactorCodeRequest`, but runtime validation is governed by the separate `RegenerateBackupCodesBody` Zod schema from `@api/schemas.zod` — keep them in sync when changing the contract.
