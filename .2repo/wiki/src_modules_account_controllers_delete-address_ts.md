# src/modules/account/controllers/delete-address.ts

## Purpose
Thin HTTP adapter for `DELETE /account/addresses/:addressId`. It extracts auth context and the `addressId` param, delegates to `accountService.addressRemove`, and formats the result into an Express response. It exists so the route layer stays declarative while request parsing and response shaping live here.

## Key elements
- **`deleteAddress(request, response)`** — Exported handler. Reads the user id from `authContextOf(request)` and `addressId` from `request.params`, calls `accountService.addressRemove(id, addressId)`, then either short-circuits via `refused()` or sends `successResponse` (200) with `result.data` and `result.message`. Errors are funnelled through `catchAs(response, 'deleteAddress')`.

## Relationships
- **`src/infrastructure/http/controller.ts`** — Provides the `catchAs` and `refused` helpers that handle the uniform error/rejection response pattern.
- **`src/infrastructure/http/request.ts`** — Provides `authContextOf` to pull the authenticated user id out of the request (populated by upstream `isAuth` middleware).
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for constructing the JSON success payload.
- **`src/modules/account/routes.ts`** — Registers `deleteAddress` as the handler for the `DELETE /account/addresses/:addressId` route.
- **`src/modules/account/services/index.ts`** — Exports `accountService`; this controller calls `accountService.addressRemove` and never touches the repository directly.

## Notes
- The controller is intentionally pass-through: all business logic (including promoting the oldest entry when the default is removed) lives in the service/repository layer. The response body carries the *full* address list so the caller can see where the default flag landed after removal.
- `refused(response, result)` is a guard that short-circuits the promise chain (returns `undefined`) when the service signals a rejection, preventing a subsequent success write.
- The `addressId` param is typed as `string`; no validation beyond type casting happens here.
