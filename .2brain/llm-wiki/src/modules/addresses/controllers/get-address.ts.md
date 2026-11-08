---
source: src/modules/addresses/controllers/get-address.ts
sha256: 301b1cd8d42c7f4f429475b1388bde08c9c19edc556275eef7fad35a13212046
generated_at: 2026-11-08T04:53:46.785641+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/get-address.ts

## Purpose

Thin HTTP adapter for `GET /account/addresses/:addressId`. It validates the path parameter, delegates to `addressService.get`, and maps the result to a standard HTTP response. Exists so the Express route table stays declarative and all I/O shaping lives in one small, testable function.

## Key elements

- **`getAddress(request, response)`** — Exported handler. Reads `request.authContext.id` (guaranteed by upstream `isAuth` middleware), validates `:addressId` via `requireId`, calls `addressService.get(ownerId, addressId)`, then either emits a 200 `successResponse<Address>` or short-circuits on refusal/404. Catches downstream rejections with `catchAs`.

## Relationships

- **`src/infrastructure/http/ids.ts`** — `requireId` validates the `addressId` path param and sends a 404 (`addresses.not-found`) if missing/malformed.
- **`src/infrastructure/http/controller.ts`** — `refused` inspects a service result for an authorization failure and writes the appropriate 403/404; `catchAs` is the default `.catch` handler that maps unhandled rejections to a 500.
- **`src/infrastructure/http/response.ts`** — `successResponse<Address>(…)` serialises the payload into the standard `{ data }` envelope.
- **`src/modules/addresses/service.ts`** — `addressService.get(id, addressId)` performs the actual lookup (ownership check, DB fetch) and returns a discriminated result.
- **`src/modules/addresses/routes.ts`** — Imports `getAddress` and binds it to the `GET /account/addresses/:addressId` route.
- **`src/types/index.ts`** — Supplies the `Address` type used as the generic parameter of `successResponse`.

## Notes

- All three failure modes (someone else's address, unknown id, malformed id) deliberately produce the **same 404** to avoid leaking whether an id belongs to another user.
- The early return `if (!addressId) return Promise.resolve()` is required because the route handler signature expects a `Promise`-returning function; it is not a no-op — `requireId` has already written the 404 response before this line executes.
- `request.authContext!` uses a non-null assertion; the contract is that `isAuth` middleware (defined elsewhere) has already rejected unauthenticated requests, so `authContext` is always present at this point.
