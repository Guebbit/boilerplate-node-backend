---
source: src/modules/addresses/controllers/get-addresses.ts
sha256: debe072c96a82565dca2894150c1df647df1958bcacbb2ef77995ff21e3614f8
generated_at: 2026-09-23T18:19:34.912984+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/get-addresses.ts

## Purpose

Thin Express controller that handles `GET /account/addresses`. It reads the authenticated user's full address book in a single service call and returns it as a JSON response. It exists as the HTTP adapter layer between the route definition and the domain service.

## Key elements

- **`getAddresses`** (exported) — Express handler for `GET /account/addresses`. Reads `request.authContext.id`, calls `addressesGet(id)`, and responds with the resulting `AddressesResponse` view. All other address mutations (create, update, delete) also return this same whole-book view, so clients never need a follow-up read.

## Relationships

- **`src/modules/addresses/service.ts`** — calls `addressesGet(id)` to fetch the address book for the given user id.
- **`src/modules/addresses/routes.ts`** — mounts `getAddresses` as the handler for the `GET /account/addresses` path.
- **`src/infrastructure/http/response.ts`** — uses `successResponse` to serialize the service result into an Express response.
- **`src/infrastructure/http/controller.ts`** — uses `catchAs` as the `.catch` handler to convert thrown/rejected errors into a consistent error response.
- **`src/types/index.ts`** — imports the `AddressesResponse` type used to type the success payload.

## Notes

- Auth is **assumed**, not checked here. The `isAuth` middleware (applied upstream in the route layer) is expected to have populated `request.authContext` before this handler runs; the `!` on `request.authContext!` reflects that guarantee.
- The handler is intentionally a single `.then`/`.catch` chain — no additional branching. Any business-level failure surfaces through `addressesGet`'s rejection and is handled by the shared `catchAs` utility.
