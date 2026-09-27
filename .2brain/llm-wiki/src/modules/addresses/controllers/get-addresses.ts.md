---
source: src/modules/addresses/controllers/get-addresses.ts
sha256: 025e93155d0435d45e7c24b98169a0e48d843aee68dc7da275acbee9ce210230
generated_at: 2026-09-27T14:38:18.341673+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/get-addresses.ts

## Purpose

Express controller that handles `GET /account/addresses`. It is a thin HTTP adapter: it extracts the caller's id from the auth context, delegates to the service layer, and serialises the result. It exists to separate transport concerns (Express request/response) from domain logic in the addresses service.

## Key elements

- **`getAddresses`** (exported) — the sole handler. Reads `request.authContext!.id`, calls `addressesGet(id)`, and sends the view back via `successResponse`. Errors are funnelled to `catchAs(response, 'getAddresses')`.

## Relationships

- **`src/modules/addresses/service.ts`** — calls `addressesGet`, the single service function this controller wraps.
- **`src/infrastructure/http/controller.ts`** — provides `catchAs`, the shared error-catcher used for the `.catch` branch.
- **`src/infrastructure/http/response.ts`** — provides `successResponse`, the shared 200-wrapper that serialises the payload.
- **`src/modules/addresses/routes.ts`** — registers `getAddresses` on the `GET /account/addresses` route (and is the entry point that wires this handler into the app).
- **`src/types/index.ts`** — supplies the `AddressesResponse` type used to parameterise `successResponse`.

## Notes

- The auth id is accessed via a non-null assertion (`request.authContext!`). The file's comment states this is safe because an `isAuth` middleware runs first; there is no runtime guard in this file itself.
- By design, every mutating address endpoint (`post-address`, `update-address`, `delete-address`) returns the *same* whole-book view that this endpoint produces. Clients are expected to use the write response as the new source of truth rather than issuing a follow-up `GET`.
- The handler is intentionally a single service call with no local branching or transformation logic — keep it that way.
