---
source: src/modules/api-keys/controllers/post-api-key.ts
sha256: 36c785a243bd646f45149c280a4fbdb4d66175ba93f205c9006b039fe37d9286
generated_at: 2026-11-08T05:02:02.177560+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/controllers/post-api-key.ts

## Purpose

HTTP controller that handles `POST /api-keys`. It validates the request body against a Zod schema, delegates to the api-keys service to mint a new credential, and emits a `201 Created` response with a `Location` header pointing to the new resource.

## Key elements

- **`mintApiKey`** (exported) — The sole export. Accepts an Express `Request`/`Response`, parses the body with `CreateApiKeyBody`, calls `apiKeysService.mintApiKey` with the parsed payload and tenant/caller context, then either returns a `201` with the created key or propagates a refusal / error.

## Relationships

- **`src/modules/api-keys/routes.ts`** — Registers `mintApiKey` as the handler for the `POST /api-keys` route.
- **`src/modules/api-keys/services/index.ts`** — Provides `apiKeysService.mintApiKey`, the domain operation that actually creates the key and enforces the permission-subset rule (returning a 422 via the `refused` shape when it fails).
- **`src/infrastructure/http/controller.ts`** — Supplies the `parseBody`, `refused`, and `catchAs` helpers used for validation, error mapping, and exception handling.
- **`src/infrastructure/http/request.ts`** — Supplies `tenantCallerContextOf`, which extracts tenant and caller identity from the request for the service call.
- **`src/infrastructure/http/response.ts`** — Supplies `createdResponse`, which builds the `201` + `Location` reply.
- **`src/types/index.ts`** — Provides the `CreateApiKeyRequest` (body shape) and `ApiKeyCreated` (response payload) types.

## Notes

- The permission-subset check (a requested key's `permissions` must be ⊆ the caller's own) is enforced **inside the service**, not here. The controller simply forwards the `refused` result from the service back to the client as a 422.
- The response `Location` header is set to `/api-keys/{id}`; the `id` comes from `result.data.id` returned by the service.
- Body validation is a short-circuit: if `parseBody` returns a falsy value the function exits without touching the service.
