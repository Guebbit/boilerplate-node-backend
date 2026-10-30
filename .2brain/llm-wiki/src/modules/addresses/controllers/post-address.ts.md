---
source: src/modules/addresses/controllers/post-address.ts
sha256: f4b7c59a0ac7394cb27aebf674cc23351dfe8f1e225b6f4c1825c53aa6ca0118
generated_at: 2026-10-29T03:07:57.010336+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/post-address.ts

## Purpose
HTTP handler for `POST /account/addresses`. Validates the request body, delegates creation to the address service, and responds with `201 Created` plus a `Location` header pointing to the new entry.

## Key elements
- **`postAddress`** (default export) — The controller function. Reads the authenticated user's id from `request.authContext`, validates the body against the `AddAddressBody` Zod schema, calls `addressService.create(id, body)`, and either returns the created `Address` (201) or propagates a refusal / caught error.
- **`parseBody`**, **`refused`**, **`catchAs`** — Imported from `@infrastructure/http/controller`; standard guard/handling helpers used inline.
- **`createdResponse`** — Imported from `@infrastructure/http/response`; sets status 201, body, and the `Location` header.

## Relationships
- **`src/modules/addresses/routes.ts`** — Registers `postAddress` as the handler for the POST route (the file's JSDoc confirms the endpoint path).
- **`src/modules/addresses/service.ts`** — `addressService.create(id, body)` is the sole business-logic call; all default-address and persistence concerns live there (and in `repository.ts`).
- **`src/infrastructure/http/controller.ts`** — Source of the `parseBody`, `refused`, and `catchAs` helpers that handle validation, refusal short-circuiting, and error serialization.
- **`src/infrastructure/http/response.ts`** — Source of `createdResponse`, which formats the 201 reply and `Location` header.
- **`src/types/index.ts`** — Provides the `Address` and `AddressInput` type aliases used for the request body and the response payload.

## Notes
- Auth is enforced upstream by an `isAuth` middleware; the handler uses the non-null assertion `request.authContext!` and does **not** perform its own auth check.
- Default-address semantics (first entry auto-becomes default; a later entry must explicitly claim the slot, demoting the current holder in a single write) are a domain rule owned by the service/repository layer, not this file.
- Sibling controllers for the same resource live in the same directory: `update-address.ts`, `get-addresses.ts`, `delete-address.ts`.
