---
source: src/modules/account/controllers/delete-account-confirm.ts
sha256: c52f169fa19a34b777a85da911ee1bceca9729fe2465c2fadfb36ff4e7b7aecb
generated_at: 2026-10-15T09:53:27.192983+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-account-confirm.ts

## Purpose

Handles the `DELETE /account/delete-confirm` endpoint. It validates a one-time deletion token supplied in the request body, delegates the hard-delete to `accountService`, then tears down the caller's session cookie before returning a success response.

## Key elements

- **`deleteAccountConfirm`** (exported function) — The sole export. Accepts an Express `Request`/`Response` pair, parses the body against `ConfirmAccountDeleteBody` (Zod schema), calls `accountService.confirmAccountDeletion(token, callerContext)`, and either destroys the session cookie + returns success, or forwards a database error through the shared error interpreter.

## Relationships

- **`src/modules/account/routes.ts`** — Registers `deleteAccountConfirm` as the handler for the `DELETE /account/delete-confirm` route.
- **`src/modules/account/services/index.ts`** — Provides `accountService.confirmAccountDeletion`, which performs the actual token verification and account deletion.
- **`src/modules/account/session/cookies.ts`** — Provides `destroySessionCookie`, called on success to invalidate the caller's session.
- **`src/infrastructure/http/controller.ts`** — Provides `parseBody` (Zod validation helper) and `refused` (checks for a business-rejection result without throwing).
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, which extracts caller metadata from the request for audit/authorization context.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, the standard success envelope.
- **`src/infrastructure/http/errors.ts`** — Provides `rejectDatabaseError`, which maps known database failures to specific status codes instead of a blanket 500.
- **`src/types/index.ts`** — Supplies the `AccountDeleteConfirmRequest` type used to shape the generic `Request` parameter.

## Notes

- The success response body is `undefined`; the only signal back to the client is the status code and a message string from the service result.
- `refused` is a non-throwing rejection path: if the service signals "refused" (e.g. token already spent or invalid), the handler short-circuits without touching the session cookie.
- `destroySessionCookie` is called **only** after a successful deletion, so a failed attempt leaves the session intact for retry.
- The error path deliberately funnels through `rejectDatabaseError` so that recognised database failures (connection loss, deadlocks, etc.) surface with a distinguishable status code, matching the convention used by every other write path in the codebase.
