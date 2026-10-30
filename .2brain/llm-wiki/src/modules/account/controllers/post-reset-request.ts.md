---
source: src/modules/account/controllers/post-reset-request.ts
sha256: 03135b9ecb9f002ec72f079b4a775fa17cb2a7319c7b07a838fee9490d947cf6
generated_at: 2026-10-29T02:32:14.066936+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reset-request.ts

## Purpose

Thin HTTP adapter for `POST /account/password/reset`. Validates the request body shape and fires a non-blocking call to `accountService.requestPasswordReset`, then immediately returns `204 No Content` — the same response (and timing) for registered and unregistered emails, preventing user enumeration.

## Key elements

- **`postResetRequest`** (exported) — Express handler. Validates the body against `RequestPasswordResetBody` (Zod schema), extracts `callerContextOf(request)`, invokes `accountService.requestPasswordReset(email, ctx)` as a floating promise (`void`), and calls `noContentResponse(response)`.
- **`parseBody(RequestPasswordResetBody, …)`** — from `@infrastructure/http/controller`; shape-validates the raw body and short-circuits with an error response if it fails.
- **`callerContextOf(request)`** — from `@infrastructure/http/request`; pulls authenticated caller metadata out of the Express request.
- **`noContentResponse(response)`** — from `@infrastructure/http/response`; sends `204` with no body.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/routes.ts` | Registers `postResetRequest` as the handler for the `/account/password/reset` route. |
| `src/modules/account/services/index.ts` | Source of `accountService.requestPasswordReset` — the sole business-logic call this file makes. |
| `src/infrastructure/http/controller.ts` | Provides `parseBody` used for Zod schema validation. |
| `src/infrastructure/http/request.ts` | Provides `callerContextOf` for extracting caller identity/context. |
| `src/infrastructure/http/response.ts` | Provides `noContentResponse` for the uniform `204` reply. |
| `src/types/index.ts` | Supplies the `PasswordResetRequest` type used in the Express generic signature. |

## Notes

- **Intentional fire-and-forget.** The `void` + `// eslint-disable-next-line @typescript-eslint/no-floating-promises` is deliberate: awaiting the service would let response time leak whether the email exists (OWASP "consistent response time" guidance). The service contract is that `requestPasswordReset` never rejects — a failed lookup is logged internally and returns `false`.
- **The controller never sees the token.** Token generation, the `AUTH_PASSWORD_RESET_REQUESTED` audit emit, the metric, and the mail enqueue all live inside the service; this file only passes `email` and caller context.
- **Shape validation ≠ existence check.** `parseBody` confirms the body matches the schema (e.g. email is a string); it does *not* verify the account exists.
