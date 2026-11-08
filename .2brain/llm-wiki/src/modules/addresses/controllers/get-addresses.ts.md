---
source: src/modules/addresses/controllers/get-addresses.ts
sha256: e1f7104f73d67d25a2d6efa786400fd677bcc0a133d172aa597dd107f6ca078a
generated_at: 2026-11-08T04:53:55.692704+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/get-addresses.ts

## Purpose

Thin HTTP adapter that exposes `GET /account/addresses`, returning the authenticated caller's full address book in one service call. It exists to decouple Express plumbing from domain logic so the service layer stays transport-agnostic.

## Key elements

- **`getAddresses(request, response)`** — The sole export. Reads the user ID from `request.authContext!`, calls `addressService.list(id)`, sends the result via `successResponse`, and routes any rejection through `catchAs(response, 'listAddresses')`.
- **`successResponse<AddressesResponse>`** (imported) — Serialises the service view into a typed HTTP 200 body.
- **`catchAs`** (imported) — Centralised error-to-response mapping; the `'listAddresses'` label identifies this call site in logs.

## Relationships

- **`src/modules/addresses/routes.ts`** — Registers `getAddresses` as the handler for the `GET /account/addresses` route (behind `isAuth` middleware).
- **`src/modules/addresses/service.ts`** — Supplies `addressService.list(id)`, the only domain call this controller makes.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` used to format the 200 reply.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` for uniform error handling.
- **`src/types/index.ts`** — Defines `AddressesResponse`, the shared response shape used here and by all sibling address controllers.

## Notes

- **Whole-book return pattern.** Every write endpoint (`post-address`, `update-address`, `delete-address`) also returns the full address list, so clients never need a follow-up GET after a mutation. Keep the response shape consistent across those siblings.
- **Auth is middleware-guaranteed.** The `!` on `request.authContext` is safe only because `isAuth` runs before this handler; do not add a null-check here unless the middleware contract changes.
- **No input validation.** This is a pure read keyed by the authenticated user; there are no body/query parameters to validate.
