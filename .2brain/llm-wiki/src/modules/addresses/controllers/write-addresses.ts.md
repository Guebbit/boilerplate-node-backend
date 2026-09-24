---
source: src/modules/addresses/controllers/write-addresses.ts
sha256: 14455f86159f74fb5413a2823640e0263e021d1f3423ab0838543b1787c26028
generated_at: 2026-09-23T18:19:46.200846+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/write-addresses.ts

## Purpose

Houses the two write handlers for the account address book — adding a new address (`POST /account/addresses`) and editing one (`PUT /account/addresses/:addressId`). Both are co-located here because they share an identical three-step shape (Zod-parse body → call service → branch on `result.success`); the read and delete handlers live in sibling files because they skip the body-parsing step.

## Key elements

- **`postAddress(request, response)`** — POST handler. Extracts user `id` from `request.authContext`, validates the body against `AddAddressBody` via `parseBody`, then delegates to `addressAdd`. On success responds `200` with `AddressesResponse`; on refusal calls `refused`; on thrown error calls `catchAs`.
- **`putAddress(request, response)`** — PUT handler. Same shape as above but also pulls `addressId` from `request.params`, validates against `UpdateAddressBody`, and delegates to `addressUpdate(id, addressId, body)`.

## Relationships

- **`@infrastructure/http/controller`** (`controller.ts`) — provides the shared helper trio used by both handlers: `parseBody` (Zod validation + early 422), `refused` (uniform rejection response), `catchAs` (unified error boundary).
- **`@infrastructure/http/response`** (`response.ts`) — provides `successResponse`, which serialises the success payload with a configurable status code and optional message.
- **`../service`** (`service.ts`) — the two domain functions actually invoked: `addressAdd` and `addressUpdate`. Ownership checks, default-address promotion/demotion, and repository reads all live below this layer.
- **`@types`** (`types/index.ts`) — structural types that shape the request generics (`AddressInput`, `UpdateAddressRequest`) and the response generic (`AddressesResponse`).
- **`./routes.ts`** — expected consumer that wires `postAddress` / `putAddress` onto the Express router (not imported here, but this file exists to be referenced by that router).

## Notes

- **Auth is assumed, not checked.** Both handlers non-null-assert `request.authContext!`; the file relies on `isAuth` middleware running earlier in the chain. There is no runtime guard here.
- **Default-address logic is invisible at this layer.** The "first entry becomes default / later entry claims the slot" behaviour is entirely owned by the service/repository; the controller just passes the parsed body and returns whatever the service reports.
- **Ownership is deliberately indistinguishable from absence.** `putAddress` does not check ownership itself; the service returns the same 404 for "not yours" and "doesn't exist" to avoid leaking the existence of other users' addresses.
- **Status code on success is 200, not 201.** Both `postAddress` and `putAddress` call `successResponse` with `200` even though the POST creates a resource — a deliberate (or legacy) choice, not an error path.
