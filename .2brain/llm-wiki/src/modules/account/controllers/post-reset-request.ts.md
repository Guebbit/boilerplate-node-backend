---
source: src/modules/account/controllers/post-reset-request.ts
sha256: 03135b9ecb9f002ec72f079b4a775fa17cb2a7319c7b07a838fee9490d947cf6
generated_at: 2026-11-08T04:07:27.260586+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reset-request.ts

## Purpose

HTTP adapter for `POST /account/password/reset`. It validates the request body shape, delegates to `accountService.requestPasswordReset` in a detached (fire-and-forget) call, and immediately returns `204 No Content` regardless of whether the email is registered — deliberately preventing user enumeration and timing-attack leaks.

## Key elements

- **`postResetRequest`** (exported function) — The sole export. Accepts an Express `Request`/`Response` pair, validates the body against `RequestPasswordResetBody` (Zod schema), fires `accountService.requestPasswordReset` without awaiting, and sends `noContentResponse`.
- **`parseBody(RequestPasswordResetBody, …)`** — Zod shape validation; short-circuits with an error response if the body is malformed.
- **`callerContextOf(request)`** — Extracts caller metadata passed to the service for audit/telemetry.
- **`void accountService.requestPasswordReset(…)`** — Deliberately un-awaited; the service owns the token write, mail enqueue, audit emit, metric, and fail-closed logic. The token value never surfaces in this file.

## Relationships

- **`src/modules/account/routes.ts`** — Registers `postResetRequest` as the handler for the `POST /account/password/reset` route.
- **`src/modules/account/services/index.ts`** — Provides the `accountService` instance whose `requestPasswordReset` method performs the actual work (lookup, token generation, mail send, audit, metrics).
- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody` for inline Zod validation.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf` to derive the authenticated caller's context.
- **`src/infrastructure/http/response.ts`** — Supplies `noContentResponse` (the uniform 204 reply).
- **`src/types/index.ts`** — Defines the `PasswordResetRequest` type used in the Express generic.

## Notes

- The service call is intentionally **not awaited** (`void` + floating-promise ESLint disable). Awaiting it would introduce a timing difference between registered and unregistered addresses, violating the OWASP "consistent response time" guidance.
- `requestPasswordReset` is documented to **never reject**; a failed lookup is logged and resolves to `false`, so the `void` is safe.
- All side-effects (token storage, email dispatch, `AUTH_PASSWORD_RESET_REQUESTED` event, metrics, audit row) live in the service layer — this file has zero business logic.
