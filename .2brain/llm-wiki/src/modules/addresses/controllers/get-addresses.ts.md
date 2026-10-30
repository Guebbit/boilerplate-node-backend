---
source: src/modules/addresses/controllers/get-addresses.ts
sha256: e1f7104f73d67d25a2d6efa786400fd677bcc0a133d172aa597dd107f6ca078a
generated_at: 2026-10-29T03:07:47.936802+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/get-addresses.ts

## Purpose

Thin HTTP adapter for `GET /account/addresses`. It extracts the caller's user id from the authenticated request, delegates to `addressService.list`, and sends the full address-book view back. It exists so the route layer stays declarative and the controller stays a single-line translation between Express and the service.

## Key elements

- **`getAddresses(request, response)`** — the sole export; an async Express handler that calls `addressService.list(id)` and returns the result via `successResponse<AddressesResponse>`. Errors are delegated to `catchAs(response, 'listAddresses')`.

## Relationships

- **`src/modules/addresses/service.ts`** — provides `addressService`, whose `list(id)` method performs the actual address-book read.
- **`src/modules/addresses/routes.ts`** — registers `GET /account/addresses` and wires this handler (behind `isAuth` middleware).
- **`src/infrastructure/http/controller.ts`** — supplies `catchAs`, the shared error-capture helper used in the `.catch` branch.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse`, the canonical 200-envelope formatter.
- **`src/types/index.ts`** — exports the `AddressesResponse` type that constrains the response payload shape.

## Notes

- `request.authContext` is accessed with a non-null assertion (`!`); it is guaranteed to be set by the `isAuth` middleware applied in the route — no runtime guard lives here.
- The file's doc-comment notes that the sibling write controllers (`post-address`, `update-address`, `delete-address`) all return the **same** whole-book view, so a client never issues a follow-up GET after a mutation. This makes the response contract of every address endpoint identical.
- The handler is intentionally a single promise chain (`.then`/`.catch`) rather than `async/await`, matching the `catchAs` helper's expected `Promise` return shape.
