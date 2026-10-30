---
source: src/modules/addresses/controllers/delete-address.ts
sha256: bb6191a8293bddb7dca01ab5a0486b69b3efa6f56b587aeacfcc5956e7cc4ef5
generated_at: 2026-10-29T03:07:31.495108+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/delete-address.ts

## Purpose
Thin HTTP adapter that handles `DELETE /account/addresses/:addressId`. It validates the path parameter, delegates the actual deletion to `addressService.remove`, and returns a 204 with no body on success. It exists so the route layer stays a one-line registration while all HTTP concerns (param extraction, error shaping, response codes) live here.

## Key elements
- **`deleteAddress`** *(exported function)* — Express handler accepting `Request<{ addressId: string }>` / `Response`. Reads `id` from `request.authContext`, validates `:addressId` via `requireId`, calls `addressService.remove(id, addressId)`, short-circuits on a rejected result (`refused`), and otherwise sends a 204 via `noContentResponse`. Errors are funneled through `catchAs`.

## Relationships
- **`../service`** (`addressService.remove`) — the sole business-logic call; the controller has no other domain access.
- **`@infrastructure/http/ids`** — `requireId` extracts and validates the `:addressId` param, returning `undefined` (and a 404) when absent.
- **`@infrastructure/http/response`** — `noContentResponse` produces the 204 reply.
- **`@infrastructure/http/controller`** — `refused` inspects a result and sends the appropriate rejection status if the service refused the operation; `catchAs` maps thrown errors to an HTTP error response tagged with the controller name `'deleteAddress'`.
- **`routes.ts`** — registers `deleteAddress` as the handler for the `DELETE /account/addresses/:addressId` route (implied by the module doc comment and the handler signature).

## Notes
- `request.authContext!` uses a non-null assertion; correctness depends on the `isAuth` middleware running upstream. No guard is present in this file.
- The 204 carries **no body**. A client that needs to see which address is now "default" must refetch the address book.
- The "promote oldest remaining entry to default" logic is **not** here — it lives in the repository layer (referenced in the block comment as `repository.ts`). The controller is deliberately unaware of that side-effect.
- The `result` returned by `addressService.remove` is inspected by `refused` before the 204 is sent; if the service signals a rejection (e.g. "cannot remove last address"), a different status code is returned and no 204 goes out.
