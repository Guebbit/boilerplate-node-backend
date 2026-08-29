# src/modules/account/controllers/delete-address.ts

## Purpose

Controller handler for `DELETE /account/addresses/:addressId`. Removes a single address entry from the authenticated user's address book and returns the updated book so the caller can see the current state (including any default-promotion) in one round-trip.

## Key elements

- **`deleteAddress`** (exported) — The sole export. Reads the user `id` from the auth context, the target `addressId` from route params, delegates to `accountService.addressRemove`, then either short-circuits via `refused` (e.g. permission denied) or sends `successResponse(response, result.data, 200, result.message)`. Errors are funneled through `catchAs(response, 'deleteAddress')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies the `refused` guard (early-exit on denial results) and `catchAs` wrapper (standard error serialization).
- **`src/infrastructure/http/request.ts`** — Supplies `authContextOf` to extract the authenticated user's `id` from the request (set upstream by the `isAuth` middleware).
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` for building the JSON success envelope.
- **`src/modules/account/routes.ts`** — Wires this function to the `DELETE /account/addresses/:addressId` route behind the auth middleware.
- **`src/modules/account/services/index.ts`** — Provides `accountService.addressRemove(id, addressId)`, which performs the actual deletion and default-promotion logic in the repository layer.

## Notes

- Returns HTTP **200** (not 204) because the body carries the full updated address list plus a human-readable `message`, so the client never needs a second GET to discover which entry became default after removing the previous one.
- The controller is deliberately thin: all domain rules (e.g. promoting the oldest remaining entry to default) live in the service/repository; the controller only orchestrates auth → service → response.
- `catchAs` tags the error log with `'deleteAddress'` for easier correlation in observability tooling.
