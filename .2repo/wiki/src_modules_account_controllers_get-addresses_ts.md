# src/modules/account/controllers/get-addresses.ts

## Purpose
GET controller for `/account/addresses`. Returns the authenticated caller's full address book in a single response. It also serves as the canonical post-mutation view shared by the write and delete address controllers, so clients never need a follow-up read after a change.

## Key elements
- **`getAddresses(request, response)`** – The sole export. Reads the user `id` from the auth context, delegates to `accountService.addressesGet(id)`, sends the result via `successResponse`, and funnels any rejection through `catchAs`.

## Relationships
- **`src/modules/account/routes.ts`** – Mounts `getAddresses` on the `GET /account/addresses` route (upstream caller).
- **`src/modules/account/services/index.ts`** – Source of `accountService`; this controller calls its `addressesGet` method for the actual data fetch.
- **`src/infrastructure/http/response.ts`** – Provides `successResponse`, the standard 200 envelope used to send the address list.
- **`src/infrastructure/http/request.ts`** – Provides `authContextOf`, which extracts the authenticated user identity from the request.
- **`src/infrastructure/http/controller.ts`** – Provides `catchAs`, the shared error-catch wrapper that shapes rejection responses.

## Notes
- Auth is assumed, not checked here; the `isAuth` middleware (referenced in the JSDoc) guarantees the context is present before this handler runs.
- The same return shape is intentionally reused by the write (`./write-addresses.ts`) and delete (`./delete-address.ts`) controllers, so any change to the view structure here affects all three endpoints.
