---
source: src/modules/account/controllers/post-2fa-method-send.ts
sha256: 45a36c2e738fab244f8b18ffc4d48133eea5f1e427a43bbd10ca62db8444ffd4
generated_at: 2026-11-08T04:03:51.740100+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-method-send.ts

## Purpose

Thin HTTP adapter for `POST /account/2fa/methods/{method}/send`. Validates the path parameter, delegates to `twoFactorService.sendMethodCode`, and maps the service result onto a standard HTTP response. Authentication and the per-account delivery budget are enforced upstream (route middleware), not here.

## Key elements

- **`post2faMethodSend(request, response)`** — the sole export. Reads `request.authContext!.id`, validates `request.params` against the Zod schema `SendTwoFactorMethodCodeParams`, calls `twoFactorService.sendMethodCode`, and returns either a `200` body (`TwoFactorDelivery`) or a refused/error response.

## Relationships

- **`src/modules/account/services/index.ts`** — imports `twoFactorService`; the only domain logic call in this file.
- **`src/infrastructure/http/controller.ts`** — supplies `parseBody` (Zod validation of path params), `refused` (maps a rejected service result to an HTTP error), and `catchAs` (unified error handler).
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf` to extract IP/user-agent context for the service call.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` to serialize the `TwoFactorDelivery` payload.
- **`src/modules/account/routes.ts`** — registers this handler on the `POST /account/2fa/methods/:method/send` path (implied by the module doc-comment and param shape).
- **`src/types/index.ts`** — provides the `TwoFactorDelivery` type used in the response payload.

## Notes

- `request.authContext!` uses a non-null assertion; the file assumes an upstream auth middleware has already populated it. No defensive check is present.
- The "method" value is a **path parameter**, not a body field — `parseBody` here is a generic name in this codebase that actually validates `request.params`.
- The route-level guards (critical-auth check, delivery budget) are intentionally *not* in this file; adding them here would be a convention violation.
