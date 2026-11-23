---
source: src/modules/account/controllers/get-reauth-methods.ts
source_sha256: 3f9afb1a6cf7f8e679ce38c734e7b608dfdb5b94995016c7beb422cab3a76e7b
context_sha256: 2762aeede3e8901f4483dadde9ed0f1d5d261dd9322497b5c7a57d0b67c2b5a7
generated_at: 2026-11-22T03:21:57.078825+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/get-reauth-methods.ts

## Purpose
Controller for `GET /account/reauth`. It is a thin HTTP adapter over `accountService.reauthMethods`. It reports which ways the caller's account can answer a `401 REAUTH_REQUIRED` challenge.

## Key elements
- `getReauthMethods(request, response)` is the only export. It reads `id` from `request.authContext!` and calls `accountService.reauthMethods(id)`.
  - If `refused(response, result)` returns true, the handler returns without sending anything further.
  - Otherwise it sends `result.data` through `successResponse<ReauthMethods>`.
  - Any rejection goes to `catchAs(response, 'getReauthMethods')`.

## Relationships
- `src/infrastructure/http/controller.ts` supplies `refused` (handles refused service results) and `catchAs` (error handler tagged with the controller name).
- `src/infrastructure/http/response.ts` supplies `successResponse`, which sends the success payload.
- `src/modules/account/services/index.ts` exports `accountService`, whose `reauthMethods` does the actual work.
- `src/types/index.ts` provides the `ReauthMethods` type (imported from `@types`) for the response payload.
- `src/modules/account/routes.ts` is the neighbor that wires this handler to the route. The controller file itself does not show the wiring.

## Notes
- The route uses plain `isAuth`, not a fresh-session check. A stale session has to be able to learn its reauth options, otherwise it could never find out how to become fresh.
- The non-null assertion on `request.authContext!` assumes the auth middleware has already run.
