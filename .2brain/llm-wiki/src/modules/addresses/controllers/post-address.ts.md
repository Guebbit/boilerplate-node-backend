---
source: src/modules/addresses/controllers/post-address.ts
sha256: a97d3eb8645db2b084f2473227ceb8219f207145cff929dda79a806ba133d43d
generated_at: 2026-10-14T14:51:23.033930+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/post-address.ts

## Purpose

HTTP handler for `POST /account/addresses`. Validates the request body against the `AddAddressBody` Zod schema, delegates the create (and default-address promotion) to `addressAdd` in the service layer, and responds `201 Created` with the new address and a `Location` header.

## Key elements

- **`postAddress`** (exported) – The sole export. Accepts an Express `Request` (typed with `AddressInput` as the body) and `Response`. Flow:
  1. Reads `id` from `request.authContext` (set upstream by the `isAuth` middleware).
  2. Parses and validates `request.body` via `parseBody(AddAddressBody, …)`; short-circuits with an error if validation fails.
  3. Calls `addressAdd(id, body)`.
  4. On success, sends `createdResponse` with the address payload and a `Location` of `/account/addresses/${data.id}`.
  5. On refusal or unexpected error, defers to `refused` / `catchAs` helpers.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Imports `parseBody`, `refused`, and `catchAs`; all three handle the early-exit / error-response paths so this controller stays thin.
- **`src/infrastructure/http/response.ts`** – Imports `createdResponse`, which formats the `201` + `Location` response.
- **`src/modules/addresses/service.ts`** – Calls `addressAdd`, which owns the read-modify-write logic (including first-entry-becomes-default and subsequent default-claim demotion, delegated further to `repository.ts`).
- **`src/modules/addresses/routes.ts`** – Registers `postAddress` as the handler for the `POST /account/addresses` route.
- **`src/types/index.ts`** – Imports `Address` and `AddressInput` for typing the response payload and the expected body shape.

## Notes

- The handler is intentionally thin: all business logic (default-address promotion, atomic read-modify-write) lives in `service.ts` / `repository.ts`. See the `addressAdd` docblock for the two-step default semantics.
- `request.authContext` is asserted non-null (`!`); the contract is that the `isAuth` middleware runs before this handler. Removing or reordering that middleware will cause a runtime crash, not a validation error.
- Sibling controllers follow the same pattern: `get-addresses.ts` (read), `update-address.ts` (edit), `delete-address.ts` (remove).
