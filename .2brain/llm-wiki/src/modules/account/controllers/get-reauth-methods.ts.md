---
source: src/modules/account/controllers/get-reauth-methods.ts
sha256: 3f9afb1a6cf7f8e679ce38c734e7b608dfdb5b94995016c7beb422cab3a76e7b
generated_at: 2026-10-14T08:31:59.950152+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-reauth-methods.ts

## Purpose

Thin Express handler for `GET /account/reauth`. It exposes the reauthentication methods available to the caller's account so that a client receiving a `401 REAUTH_REQUIRED` challenge can discover how to complete reauth. All business logic lives in `accountService`; this file only adapts the HTTP layer.

## Key elements

- **`getReauthMethods(request, response)`** — the sole export. Reads the caller's account `id` from `request.authContext!`, calls `accountService.reauthMethods(id)`, then either short-circuits via `refused` (service-level denial) or sends the `ReauthMethods` payload through `successResponse`. Errors are delegated to `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** — supplies the `refused` and `catchAs` helpers used for uniform refusal and error formatting.
- **`@infrastructure/http/response`** — supplies `successResponse` for the happy-path JSON reply.
- **`@modules/account/services`** — provides `accountService.reauthMethods(id)`, the actual domain query.
- **`@modules/account/routes`** — the routing layer that binds this handler to the `GET /account/reauth` path.
- **`@types`** — exports the `ReauthMethods` type used to type the response payload.

## Notes

- Auth is intentionally minimal: only `isAuth` is required (per the file's doc comment). A stale session can still call this endpoint to learn its reauth options, which a stricter guard would block.
- `request.authContext!` uses a non-null assertion, relying on upstream middleware to have already validated and attached the auth context.
- Follows the project-wide controller pattern: `.then(refused → successResponse).catch(catchAs)`.
