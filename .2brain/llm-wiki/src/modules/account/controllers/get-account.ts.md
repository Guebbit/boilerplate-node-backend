---
source: src/modules/account/controllers/get-account.ts
sha256: 9d653feaa50c6592394fbfc28751a1af6d7fe256f6ae39e4540d52496cd0ed19
generated_at: 2026-11-14T18:31:17.678212+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-account.ts

## Purpose

Thin HTTP adapter for `GET /account`. It fetches the authenticated user's full profile fresh from the database (via `accountService.getOwnProfile`) and returns a complete `AccountView`, rather than echoing the JWT payload which would silently omit fields like `verifiedAt` and `locale` that the client's verify banner and saved-language flow depend on.

## Key elements

- **`getAccount(request, response)`** — the sole export. Express-style handler that:
  - Rejects with **401** if `request.authContext` is missing or the user row no longer exists (dead session, not a server fault).
  - Calls `accountService.getOwnProfile(authContext.id, callerContextOf(request))` to read the user document.
  - Shapes the result with `accountViewOf(user, authContext)` into an `AccountView`.
  - Sets an ETag via `setEtag` before sending the success response.
  - Routes promise rejections through `catchAs(response, 'getAccount')`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/controller.ts` | Supplies `catchAs`, the error-handling wrapper this controller passes to its promise rejection handler. |
| `src/infrastructure/http/preconditions.ts` | Supplies `setEtag` to stamp the response with the user document's revision. |
| `src/infrastructure/http/request.ts` | Supplies `callerContextOf` to extract per-request caller metadata passed down to the service. |
| `src/infrastructure/http/response.ts` | Supplies `rejectResponse` (401 path) and `successResponse` (200 path). |
| `src/modules/account/routes.ts` | Registers `getAccount` as the handler for the `GET /account` route. |
| `src/modules/account/services/index.ts` | Exports `accountService`, which this controller imports and invokes to fetch the user document. |
| `src/modules/account/session/account-view.ts` | Provides `accountViewOf` to project the user document + auth context into the `AccountView` shape. |
| `src/types/index.ts` | Defines the `AccountView` type used as the response body. |

## Notes

- **Why not echo the JWT?** The token only carries `id / email / username / admin`. Returning it directly would drop `verifiedAt` and `locale`, breaking client-side verify-banner and language-persistence flows. A fresh DB read also folds in the caller's abilities and idle clock, so a signed-in page reload needs no second call.
- **Role is free here.** `authContext` was already resolved at token-verification time (membership store read), so no additional lookup occurs in this controller.
- **ETag semantics.** The ETag is derived from the stored document (a role change bumps it), but the body shifts on every read because `lastActiveAt` updates — the intended caching hint is effectively `no-store` for the body.
- **401 vs 500.** A valid token whose user row has been deleted is treated as a dead session (401), not a server error.
