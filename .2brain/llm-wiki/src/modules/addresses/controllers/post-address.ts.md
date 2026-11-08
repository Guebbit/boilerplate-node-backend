---
source: src/modules/addresses/controllers/post-address.ts
sha256: b6b1b2b8d250dc0a3fa9c1780d970c5880939e3e2a87ab919e13c8a44a95039e
generated_at: 2026-11-08T04:54:03.937312+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/post-address.ts

## Purpose
Handler for `POST /account/addresses`. Validates the request body against a Zod schema, delegates creation to the address service, and returns a `201 Created` response with a `Location` header pointing to the new entry.

## Key elements
- **`postAddress`** (exported) — Accepts an Express `Request`/`Response`. Reads the authenticated user `id` from `request.authContext`, parses the body with `CreateAddressBody`, calls `addressService.create(id, body)`, and on success emits `201` via `createdResponse`. On refusal or error, short-circuits through `refused` / `catchAs`.

## Relationships
- **`@infrastructure/http/controller`** — Supplies the three helper functions used in the flow: `parseBody` (Zod validation), `refused` (maps a rejected result to an HTTP error), and `catchAs` (serialises unhandled errors into a standard error response).
- **`@infrastructure/http/response`** — Provides `createdResponse`, which writes the `201` status, the JSON body, and the `Location` header.
- **`../service`** — `addressService.create` performs the actual read-modify-write for address creation (including default-slot demotion logic owned by the repository layer).
- **`../routes`** — Wires `postAddress` onto the `POST /account/addresses` route with the `isAuth` middleware guaranteeing `authContext` is populated.
- **`@types`** — Supplies the `Address` and `CreateAddressRequest` types used for typing the request and the response payload.

## Notes
- Authentication is **not** checked here; it is guaranteed by the `isAuth` middleware declared in `routes.ts`. The non-null assertion on `request.authContext!` relies on that contract.
- The "first entry becomes default; a later entry can claim the slot and demote the current holder" behaviour is **not** implemented in this file — it lives in `repository.ts` / `service.ts`. This controller is purely a transport layer.
- Sibling controllers (`update-address.ts`, `get-addresses.ts`, `delete-address.ts`) cover the remaining CRUD verbs; this file handles creation only.
