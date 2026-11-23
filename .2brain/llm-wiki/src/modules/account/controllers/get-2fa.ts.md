---
source: src/modules/account/controllers/get-2fa.ts
source_sha256: 76994639d8ec69cb5cbfc8eacab88281cad5c110ac93cc1cf401003182d7d741
context_sha256: 2762aeede3e8901f4483dadde9ed0f1d5d261dd9322497b5c7a57d0b67c2b5a7
generated_at: 2026-11-22T03:20:52.290250+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/get-2fa.ts

## Purpose
Express controller for `GET /account/2fa`. It is a thin HTTP adapter that returns the caller's own second factors and the ones they could still add, by delegating to `twoFactorService.twoFactorStatus`.

## Key elements
- `get2fa(request, response)` — exported handler. Reads `id` from `request.authContext!`, calls `twoFactorService.twoFactorStatus(id)`, and:
  - on `!result.success`: calls `rejectResponse(response, result.status, result.errors)`;
  - on success: calls `successResponse<TwoFactorStatus>(response, result.data)`;
  - on a thrown or rejected error: falls through to `catchAs(response, 'get2fa')`.

## Relationships
- `src/infrastructure/http/response.ts` — supplies `successResponse` and `rejectResponse`, which write the HTTP response.
- `src/infrastructure/http/controller.ts` — supplies `catchAs`, which builds the `.catch` handler for unexpected errors, labelled `'get2fa'`.
- `src/modules/account/services/index.ts` — exports `twoFactorService`, whose `twoFactorStatus` does the actual work.
- `src/types/index.ts` — provides the `TwoFactorStatus` type used as the success payload type.
- `src/modules/account/routes.ts` — the neighbor that wires this handler to the route; the handler itself does not reference it.

## Notes
- The route requires only `isAuth`, not a step-up. The source reasons that reading your own 2FA status reveals nothing a step-up would protect.
- The handler uses a non-null assertion on `request.authContext!`, so it relies on the auth middleware having run first.
- The service returns a result object (`success`, `status`, `errors`, `data`) rather than throwing for expected failures.
