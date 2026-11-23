---
source: src/modules/addresses/controllers/get-address.ts
source_sha256: 301b1cd8d42c7f4f429475b1388bde08c9c19edc556275eef7fad35a13212046
context_sha256: b73eea2b1adb4d44bb0a28adbef6fd8e6570ce26c30df27ebe3cf926d380e162
generated_at: 2026-11-22T04:12:38.365128+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/controllers/get-address.ts

## Purpose
Express controller for `GET /account/addresses/:addressId`. It is a thin HTTP adapter that returns one entry from the authenticated caller's own address book by delegating to the addresses service (`src/modules/addresses/service.ts`). Someone else's entry, an unknown id and a malformed id all produce the same 404.

## Key elements
- `getAddress(request, response)` — the only export. It does the following:
  - Reads the caller's `id` from `request.authContext!`. The non-null assertion relies on the `isAuth` middleware having run first.
  - Validates `:addressId` with `requireId`, using the not-found key `addresses.not-found` and the param name `addressId`. If validation fails, it returns `Promise.resolve()` and does nothing more, because `requireId` has already handled the response.
  - Calls `addressService.get(id, addressId)`. If `refused(response, result)` is true, it returns without further action. Otherwise it sends `successResponse<Address>(response, result.data, 200)`.
  - Passes any rejection to `catchAs(response, 'getAddress')`.

## Relationships
- `src/infrastructure/http/ids.ts` — supplies `requireId`, which validates the path id and writes the 404 for a malformed one.
- `src/infrastructure/http/controller.ts` — supplies `refused`, which maps a refused service result to a response, and `catchAs`, which handles errors.
- `src/infrastructure/http/response.ts` — supplies `successResponse` for the 200 reply.
- `src/modules/addresses/service.ts` — supplies `addressService`, whose `get` method performs the lookup for the caller's id and the address id.
- `src/types/index.ts` — supplies the `Address` type used for the response payload.
- `src/modules/addresses/routes.ts` — mounts this controller on the route, behind the auth middleware.

## Notes
- The controller returns a Promise on every path, including the early exit.
- The controller does no ownership check of its own. It passes the caller's id and the address id to the service and relies on the service result to produce the uniform 404.
