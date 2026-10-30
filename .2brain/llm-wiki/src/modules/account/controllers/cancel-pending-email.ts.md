---
source: src/modules/account/controllers/cancel-pending-email.ts
sha256: 01dd11b05a142c86122a8768bbf4caef2dcab41033ee58031042c951d47168e3
generated_at: 2026-10-29T02:25:46.600942+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/cancel-pending-email.ts

## Purpose

Thin HTTP adapter that handles `DELETE /account/email-change`, delegating all business logic to `accountService.cancelPendingEmailChange`. It extracts the authenticated user's id and caller context, then translates the service result into a 204 or an error response.

## Key elements

- **`cancelPendingEmail(request, response)`** — exported Express handler. Reads `request.authContext.id`, calls `accountService.cancelPendingEmailChange(id, callerContextOf(request))`, responds with `noContentResponse` (204) on success, or short-circuits via `refused`/`catchAs` on error.

## Relationships

- **`src/modules/account/routes.ts`** — registers this handler on the `DELETE /account/email-change` route.
- **`src/modules/account/services/index.ts`** — provides `accountService.cancelPendingEmailChange`, the sole business-logic dependency.
- **`src/infrastructure/http/controller.ts`** — supplies `refused` (maps service "refused" outcomes to an error response) and `catchAs` (formats unhandled rejections with the label `'cancelPendingEmail'`).
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf`, which extracts request metadata (origin, user-agent, etc.) for the service call.
- **`src/infrastructure/http/response.ts`** — supplies `noContentResponse` for the 204 success path.

## Notes

- Cancelling a pending email change is an **explicit** action. Resending the current address via `PUT`/`PATCH /account` is a no-op and does **not** implicitly cancel a pending change (see `docs/modules/account.md#proving-an-address`).
- `request.authContext!` uses a non-null assertion; the auth middleware is expected to have populated it before this handler runs.
- The `.catch` label `'cancelPendingEmail'` is used for error-correlation/tracking in the catch handler.
