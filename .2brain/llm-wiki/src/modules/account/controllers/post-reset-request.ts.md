---
source: src/modules/account/controllers/post-reset-request.ts
sha256: 51859066dd85b73ccfc1e3df372c9d375110f8c7c20e18a88b51e47aad1728ba
generated_at: 2026-10-14T08:37:08.387164+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reset-request.ts

## Purpose

Thin HTTP adapter for `POST /account/reset-request`. Validates the request body, fires the password-reset workflow in a detached (fire-and-forget) call, and returns a uniform `200` regardless of whether the email is registered — preventing user enumeration via both response content and response time.

## Key elements

- **`postResetRequest`** (exported controller function) — Takes an Express `Request`/`Response`. Validates the body against the `RequestPasswordResetBody` Zod schema via `parseBody`, then calls `accountService.requestPasswordReset(email, callerContext)` in a `void`-detached manner, and immediately sends `successResponse(200, t('account.reset.email-sent'))`. No further logic lives here.

## Relationships

- **`src/modules/account/services/index.ts`** — Provides `accountService.requestPasswordReset`, which owns token generation, mail enqueue, audit logging, metrics, and fail-closed handling. The token value never crosses into this file.
- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody` for synchronous Zod validation of `request.body`.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf` to extract caller identity/metadata for the service call.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` used for the uniform 200 reply.
- **`src/infrastructure/i18n/index.ts`** (and `context.ts`) — Supplies `t()` for the localized `"account.reset.email-sent"` message.
- **`src/modules/account/routes.ts`** — Registers `postResetRequest` as the handler for the `POST /account/reset-request` route.
- **`src/types/index.ts`** — Source of the `PasswordResetRequest` type used in the Express `Request` generic.

## Notes

- The service call is deliberately detached (`void …`). The HTTP response is emitted *before* any lookup, token write, or mail enqueue completes, so response time reveals nothing about whether the address is registered (OWASP "consistent response time" guidance).
- This file performs **no** existence check and **no** conditional branching on email validity — the only branching is the early return when body validation fails.
- Failure logging, audit rows, and metrics are the service's responsibility; this controller never inspects or propagates those outcomes.
