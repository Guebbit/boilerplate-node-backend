---
source: src/modules/addresses/controllers/post-address.ts
sha256: f30bb27d0d60410afc0e7ba43346758167924775881360348b90e40df538bcce
generated_at: 2026-09-27T14:38:27.020634+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/post-address.ts

## Purpose
HTTP handler for `POST /account/addresses`. Validates the request body, delegates to the address service, and shapes the JSON response. It is the "create" half of the address-book CRUD set (sibling files handle read, update, delete).

## Key elements
- **`postAddress`** (exported) — the sole handler function. Accepts Express `Request`/`Response`, pulls the user `id` from `request.authContext`, parses the body against the `AddAddressBody` Zod schema, calls `addressAdd(id, body)`, and returns either a `successResponse` (200) or a `refused` response. Errors are funnelled through `catchAs`.

## Relationships
- **`src/infrastructure/http/controller.ts`** — supplies the `parseBody`, `refused`, and `catchAs` helpers that gate validation, rejection, and error formatting.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` used to emit the final JSON envelope.
- **`src/modules/addresses/service.ts`** — provides `addressAdd`, the single business-logic call this controller makes.
- **`src/modules/addresses/routes.ts`** — mounts `postAddress` on the router (this file is the handler it imports).
- **`src/types/index.ts`** — source of the `AddressInput` (body type) and `AddressesResponse` (payload type) generics used here.

## Notes
- The handler assumes `request.authContext` is already populated by upstream `isAuth` middleware; a non-null assertion (`!`) is used. If that middleware is ever bypassed, this will throw at runtime.
- Responds with **200 OK** rather than the conventional 201 for a successful create.
- Default-address demotion logic (first entry is default; later entries can claim the slot) is *not* handled here — it lives in `repository.ts` / `service.ts`. This file is intentionally a thin I/O wrapper.
- Body validation uses the shared `AddAddressBody` schema from `@api/schemas.zod`, not a local schema.
