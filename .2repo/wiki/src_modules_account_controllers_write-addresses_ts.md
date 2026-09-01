# src/modules/account/controllers/write-addresses.ts

## Purpose

Handles the two write operations for shipping addresses (add and edit) in a single file because they share an identical three-step shape: parse body → call the account service → branch on `result.success`. Read and delete handlers live in separate files because they do not parse a request body.

## Key elements

- **`postAddress`** — `POST /account/addresses` handler. Extracts the authenticated user id, validates the body against `AddAddressBody` (Zod), delegates to `accountService.addressAdd`, then responds with the service's data/message or a refusal.
- **`putAddress`** — `PUT /account/addresses/:addressId` handler. Same flow but also reads `addressId` from route params and delegates to `accountService.addressUpdate`.

## Relationships

- **`@infrastructure/http/controller`** — supplies the three helpers every handler uses: `parseBody` (Zod validation + 400 on failure), `refused` (uniform error response for non-success service results), and `catchAs` (unhandled-promise rejection → 500 with a tagged label).
- **`@infrastructure/http/request`** — `authContextOf` pulls the authenticated user identity off the request (set upstream by `isAuth` middleware).
- **`@infrastructure/http/response`** — `successResponse` emits the standard `{ data, message }` envelope.
- **`../services`** (`src/modules/account/services/index.ts`) — `accountService.addressAdd` / `addressUpdate` perform the actual read-modify-write; the controller is a thin dispatch layer.
- **`@types`** (`src/types/index.ts`) — `AddressInput` and `UpdateAddressRequest` are the typed body shapes bound to Express's `Request` generics.
- **`src/modules/account/routes.ts`** — registers `postAddress` and `putAddress` on the router (graph neighbor; the import direction is routes → this file).

## Notes

- **Ownership is invisible to the caller.** `putAddress` returns the same 404 for "not yours" and "doesn't exist"; the check lives in the service layer so the API never confirms that an id belongs to someone else.
- **Default-address demotion is a single atomic write.** Adding a new entry that explicitly claims the default slot demotes the current holder in the same transaction — no separate step in the controller.
- **Auth is assumed, not checked.** Both handlers read `authContextOf(request)` without a guard; the `isAuth` middleware is responsible for ensuring the context exists before the request reaches this file.
- **Shape symmetry is intentional.** If the parse→service→branch pattern changes, it changes once here (mirroring `products/controllers/write-products.ts`).
