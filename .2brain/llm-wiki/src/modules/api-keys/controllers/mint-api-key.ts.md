---
source: src/modules/api-keys/controllers/mint-api-key.ts
sha256: e759e59439a35aba2c953742a15107ae4ec77ae6fec0b0c4a0df295532fa991a
generated_at: 2026-10-14T14:57:32.781731+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/controllers/mint-api-key.ts

## Purpose

HTTP controller that handles `POST /api-keys` — the endpoint for minting a new API credential. It validates the request body, delegates to the API-keys service, and shapes the HTTP response (201 with a `Location` header on success, 422 on permission refusal).

## Key elements

- **`mintApiKey`** (exported function) — The sole handler. Accepts an Express `Request`/`Response`, parses the body against the `MintApiKeyBody` Zod schema, calls `apiKeysService.mintApiKey`, and dispatches the appropriate response. On success returns `201 Created` with the new key payload and a `Location` header of `/api-keys/:id`. On refusal (permission-subset violation) the service's `refused` result is surfaced as a 422. Uncaught errors are routed through `catchAs(response, 'mintApiKey')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Source of `parseBody`, `refused`, and `catchAs` used for body validation, refusal signaling, and error mapping.
- **`src/infrastructure/http/request.ts`** — Provides `tenantCallerContextOf(request)`, which extracts the caller's tenant-scoped identity and passes it to the service for permission checks.
- **`src/infrastructure/http/response.ts`** — Provides `createdResponse`, which writes the 201 status, body, and `Location` header.
- **`src/modules/api-keys/services/index.ts`** — Exports `apiKeysService`; the controller calls its `mintApiKey(body, context)` method, which performs the actual key generation and enforces the permission-subset rule.
- **`src/modules/api-keys/routes.ts`** — Registers `mintApiKey` as the handler for the `POST /api-keys` route.
- **`src/types/index.ts`** — Supplies the `MintApiKeyRequest` and `ApiKeyCreated` types used in the function signature and response generic.

## Notes

- The controller performs **no** permission logic itself; the 422 (naming the offending permission keys) is decided entirely inside `apiKeysService.mintApiKey`. The controller only forwards the `refused` result to the response.
- `parseBody` short-circuits the handler (sends its own error response and returns `false`) when the body fails Zod validation, so the service is never called with malformed input.
- The handler is a plain function (not a class method), consistent with the module's controller style.
