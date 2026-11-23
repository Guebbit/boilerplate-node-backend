---
source: src/modules/account/controllers/post-2fa-setup.ts
source_sha256: 2ed6b8d250100ed52d6fc6df6fcbac9158695b77beca75c8d3eae667a957ab6e
context_sha256: 47a64b4a4a9f75a4b86488cef2ed60755b2170206a6d0efc5ac0601e0a8ec293
generated_at: 2026-11-22T03:23:43.994929+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-2fa-setup.ts

## Purpose
Express controller for `POST /account/2fa/methods/{method}/setup`. It is a thin HTTP adapter that validates the request and delegates to `twoFactorService.setupTwoFactorMethod` to start (or restart) enrollment of one two-factor method.

## Key elements
- `post2faSetup(request, response)` — the exported handler.
  - Reads the authenticated user's `id` from `request.authContext!`.
  - Validates `request.params` with `SetupTwoFactorMethodParams` and `request.body ?? {}` with `SetupTwoFactorMethodBody`, both via `parseBody`. It returns early if either fails.
  - Calls `twoFactorService.setupTwoFactorMethod(id, parsed.method, body.code, callerContextOf(request))`.
  - On `!result.success`, it calls `rejectResponse(response, result.status, result.errors)`. Otherwise it calls `successResponse<TwoFactorSetup>(response, result.data)`.
  - Rejected promises are handled by `.catch(catchAs(response, 'post2faSetup'))`.

## Relationships
- `src/infrastructure/http/controller.ts` — supplies `parseBody` (schema validation that writes the error response) and `catchAs` (error handler).
- `src/infrastructure/http/request.ts` — supplies `callerContextOf` to build the caller context passed to the service.
- `src/infrastructure/http/response.ts` — supplies `successResponse` and `rejectResponse`.
- `src/modules/account/services/index.ts` — provides `twoFactorService`, which holds the actual enrollment logic.
- `src/types/index.ts` — provides the `TwoFactorSetup` type for the success payload.
- `src/modules/account/routes.ts` — mounts this handler. The route guard that requires fresh critical auth is described in the file's doc comment.

## Notes
- The body is optional because the account's first factor sends none, so the controller passes `request.body ?? {}` to validation. `code` is then presumably absent.
- The doc comment says a code from an existing factor is required once any factor is armed. A restart disarms a working factor, which is what an attacker with a stolen session would try. This check is not in the controller, so it must be enforced in the service.
- The fresh-critical-auth requirement is enforced by the route guard, not here.
- The handler relies on `request.authContext` being set (non-null assertion), so it must only be mounted behind authentication.
