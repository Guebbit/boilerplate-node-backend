---
source: src/modules/account/controllers/post-verify-request.ts
sha256: b9f2d07d8c867ce1747a043e0823ea51f14e7b0e428dfffd7511bee702b1540c
generated_at: 2026-10-29T02:32:59.645812+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-verify-request.ts

## Purpose

Thin HTTP adapter for `POST /account/email-verification/resend`. It extracts the authenticated user's id, delegates to `accountService.requestEmailVerificationFor`, and maps the service result (success or refusal) onto an Express response. It exists to keep transport concerns (auth-context extraction, response formatting, error shaping) separate from verification business logic.

## Key elements

- **`postVerifyRequest(request, response)`** – The sole export. Reads `request.authContext!.id` (guaranteed by upstream `isAuth` middleware), calls `accountService.requestEmailVerificationFor(id, callerContextOf(request))`, then either short-circuits via `refused(response, result)` or sends `successResponse(response, result.data, result.status)`. Errors are funnelled through `catchAs(response, 'postVerifyRequest')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Supplies `catchAs` (uniform error-to-HTTP mapping) and `refused` (detects a refused service result and writes the appropriate HTTP error).
- **`src/infrastructure/http/request.ts`** – Supplies `callerContextOf`, which normalises the incoming request into the caller-context object the service expects.
- **`src/infrastructure/http/response.ts`** – Supplies `successResponse` for the happy-path JSON envelope.
- **`src/modules/account/routes.ts`** – Wires `postVerifyRequest` to the `POST /account/email-verification/resend` route (the controller is consumed here, not directly by Express).
- **`src/modules/account/services/index.ts`** – Exports `accountService`, whose `requestEmailVerificationFor` method contains all state-machine and email-sending logic.

## Notes

- The non-null assertion on `request.authContext!` is intentional: the route is only reachable behind `isAuth` middleware, so the context is always populated at this point.
- The controller deliberately performs **no** state checks (e.g. "already verified"). That decision lives in the service (`services/verification.ts`), keeping a single source of truth for which states are re-verifiable.
- Uses a `.then/.catch` promise chain rather than `async/await`; follow the same pattern if you add sibling controllers.
