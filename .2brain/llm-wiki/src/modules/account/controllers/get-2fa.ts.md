---
source: src/modules/account/controllers/get-2fa.ts
sha256: 76994639d8ec69cb5cbfc8eacab88281cad5c110ac93cc1cf401003182d7d741
generated_at: 2026-09-27T14:22:48.568716+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-2fa.ts

## Purpose

Thin HTTP adapter for `GET /account/2fa`. It reads the authenticated caller's current second-factor status (active methods and available options) by delegating to `twoFactorService.twoFactorStatus`, then formats the result into a standard success or rejection response.

## Key elements

- **`get2fa(request, response)`** – The sole export. Pulls `id` from `request.authContext`, calls `twoFactorService.twoFactorStatus(id)`, and dispatches `successResponse<TwoFactorStatus>` or `rejectResponse` based on the result. Errors in the promise chain are forwarded to `catchAs(response, 'get2fa')`.

## Relationships

- **`@infrastructure/http/response`** – Supplies `successResponse` and `rejectResponse` used to shape the HTTP reply.
- **`@infrastructure/http/controller`** – Supplies `catchAs`, which converts an unhandled rejection into a logged error response.
- **`@types`** – Provides the `TwoFactorStatus` type that parameterizes the success payload.
- **`../services` (index)** – Source of `twoFactorService`; the controller calls its `twoFactorStatus` method.
- **`routes.ts`** – Expected to register `get2fa` on the `GET /account/2fa` path (the controller itself does not declare routing).

## Notes

- Uses a `!` non-null assertion on `request.authContext`, relying on an upstream auth middleware to guarantee presence. No fallback or guard is in the handler.
- The doc comment explicitly notes that only `isAuth` (basic authentication) is required—no step-up verification—because reading your own 2FA status is considered non-sensitive.
- Follows the repo's `.then()/.catch()` promise-chain style rather than `async/await`.
