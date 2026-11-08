---
source: src/modules/account/controllers/post-verify-request.ts
sha256: b9f2d07d8c867ce1747a043e0823ea51f14e7b0e428dfffd7511bee702b1540c
generated_at: 2026-11-08T04:08:13.197752+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-verify-request.ts

## Purpose

Thin HTTP adapter for `POST /account/email-verification/resend`. It extracts the authenticated user's ID, delegates to `accountService.requestEmailVerificationFor`, and maps the service result (success or refusal) onto the HTTP response. The controller contains no business logic itself.

## Key elements

- **`postVerifyRequest(request, response)`** — The sole export. Handler for the resend-verification endpoint. Reads `request.authContext!.id`, calls the service, then either short-circuits via `refused()` or emits `successResponse()`. Errors are funnelled through `catchAs(response, 'postVerifyRequest')`.
- **`callerContextOf(request)`** — Extracts caller metadata (IP, user-agent, etc.) from the request and passes it to the service.
- **`refused(response, result)`** — If the service signals a refusal (e.g. account already verified), writes the appropriate HTTP error and returns `true`, skipping the success path.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs` (unified error-to-HTTP mapping) and `refused` (early-exit for domain rejections).
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf`, used to forward caller context to the service.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` for the happy-path reply.
- **`src/modules/account/services/index.ts`** — Exports `accountService`; this controller calls its `requestEmailVerificationFor` method and depends entirely on its result shape.
- **`src/modules/account/routes.ts`** — Wires `postVerifyRequest` to the `POST /account/email-verification/resend` route and applies the `isAuth` middleware that guarantees `authContext` is populated.

## Notes

- `request.authContext!` uses a non-null assertion because `isAuth` middleware (configured in `routes.ts`) is expected to run first. There is no runtime check in this file.
- Which account states are eligible for a resend is decided inside the service (`services/verification.ts`), not here. Adding new state guards means touching the service, not this controller.
- The `catchAs` tag string (`'postVerifyRequest'`) is used for logging/correlation; keep it in sync with the function name if you rename.
