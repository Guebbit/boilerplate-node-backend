---
source: src/modules/account/controllers/cancel-pending-email.ts
sha256: b6ed71ec0b24c55733ac4f6532fd8977e01f3d99a1157224eec73a064f52c12d
generated_at: 2026-09-27T14:22:07.092984+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/cancel-pending-email.ts

## Purpose

Thin HTTP adapter for `DELETE /account/pending-email`. It extracts the authenticated user ID and caller context from the request, delegates to `accountService.cancelPendingEmailChange`, and maps the service result (or a refusal) to an HTTP response.

## Key elements

- **`cancelPendingEmail`** (exported) — Express handler for `DELETE /account/pending-email`. Reads `request.authContext!.id`, calls the service, and either short-circuits via `refused`, returns a `200` with a translated "cancelled" message, or forwards an error through `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies `refused` (short-circuit for rejected results) and `catchAs` (uniform error handling).
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf`, which derives the caller's context (IP, agent, etc.) passed into the service call.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` for the standard 200 JSON envelope.
- **`src/infrastructure/i18n/index.ts`** — supplies the `t` translation function used for the success message key `account.email-change.cancelled`.
- **`src/modules/account/routes.ts`** — registers `cancelPendingEmail` on the `DELETE /account/pending-email` route.
- **`src/modules/account/services/index.ts`** — provides `accountService`, whose `cancelPendingEmailChange` method performs the actual domain work.

## Notes

- Resending the current address via `PUT`/`PATCH /account` is intentionally a **no-op**, not an implicit cancel. Cancellation requires this explicit `DELETE` call. (See `docs/modules/account.md#proving-an-address`.)
- The controller uses a non-null assertion (`request.authContext!`), relying on an upstream auth middleware guarantee.
- On success the response body is `undefined` (200 with just a message string), not a data payload.
