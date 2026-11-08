---
source: src/modules/account/controllers/delete-email-change.ts
sha256: 01dd11b05a142c86122a8768bbf4caef2dcab41033ee58031042c951d47168e3
generated_at: 2026-11-08T04:00:39.312557+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-email-change.ts

## Purpose

Thin HTTP adapter that maps `DELETE /account/email-change` to the domain operation `accountService.cancelPendingEmailChange`. It extracts the authenticated user's ID and caller context from the request, delegates to the service, and translates the result into an HTTP status (204 or a refused error).

## Key elements

- **`cancelPendingEmail(request, response)`** (exported) — The sole route handler. Reads `request.authContext!.id`, calls `accountService.cancelPendingEmailChange(id, callerContextOf(request))`, and responds with `noContentResponse` (204) on success or short-circuits via `refused` when the service signals a rejection.
- Uses `catchAs(response, 'cancelPendingEmail')` as the `.catch` handler for uniform error serialization.

## Relationships

- **`src/modules/account/routes.ts`** — Registers `cancelPendingEmail` as the handler for the `DELETE /account/email-change` route.
- **`src/modules/account/services/index.ts`** — Source of the `accountService` instance whose `cancelPendingEmailChange` method performs the actual cancellation.
- **`src/infrastructure/http/controller.ts`** — Supplies `refused` (checks a service-level refusal and emits the appropriate error response) and `catchAs` (normalizes thrown/rejected errors into an HTTP error response).
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf(request)`, which extracts the caller-identifying context passed into the service call.
- **`src/infrastructure/http/response.ts`** — Supplies `noContentResponse` for the 204 success path.

## Notes

- The file's doc comment explicitly states that *resending* the current address via `PUT`/`PATCH /account` is a **no-op**, not an implicit cancel. Cancellation requires this explicit `DELETE` call. See `docs/modules/account.md#proving-an-address` for the full protocol.
- `request.authContext!` is accessed with a non-null assertion, meaning upstream middleware is expected to have authenticated the request before this handler runs.
