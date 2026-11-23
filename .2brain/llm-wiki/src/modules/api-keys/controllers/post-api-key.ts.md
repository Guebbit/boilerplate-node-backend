---
source: src/modules/api-keys/controllers/post-api-key.ts
source_sha256: 36c785a243bd646f45149c280a4fbdb4d66175ba93f205c9006b039fe37d9286
context_sha256: 12d3625b695e9ac946fe722d31e46149b73a8ac35778557e11c8aa595843b2a6
generated_at: 2026-11-22T04:20:52.281350+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/controllers/post-api-key.ts

## Purpose
Express controller for `POST /api-keys`. It validates the request body, asks the API keys service to mint a credential, and returns a 201 Created response with the new key's location.

## Key elements
- `mintApiKey(request, response)`: the exported handler.
  1. Parses `request.body` with the `CreateApiKeyBody` zod schema via `parseBody`. If parsing fails it returns early (`parseBody` is passed `response`).
  2. Calls `apiKeysService.mintApiKey(body, tenantCallerContextOf(request))`.
  3. If `refused(response, result)` is true, it returns without further action.
  4. Otherwise it sends `createdResponse<ApiKeyCreated>(response, result.data, '/api-keys/<id>')`.
  5. Any promise rejection goes to `catchAs(response, 'createApiKey')`.

## Relationships
- `src/infrastructure/http/controller.ts`: provides `parseBody` (schema validation), `refused` (turns a service refusal into an HTTP response) and `catchAs` (error handler).
- `src/infrastructure/http/request.ts`: `tenantCallerContextOf` builds the tenant and caller context passed to the service.
- `src/infrastructure/http/response.ts`: `createdResponse` builds the success response.
- `src/modules/api-keys/services/index.ts`: exports `apiKeysService`, which does the minting.
- `src/types/index.ts` (imported as `@types`): provides the `CreateApiKeyRequest` and `ApiKeyCreated` types.
- `src/modules/api-keys/routes.ts`: this is the expected place where the handler is mounted. The route wiring is not visible in this file.

## Notes
- Per the doc comment, `permissions` must be a subset of the caller's own permissions. The service enforces this and responds 422 naming the offending keys. The controller does not check it.
- The error label passed to `catchAs` is `'createApiKey'`, which differs from the handler name `mintApiKey`.
- The handler returns promises or `undefined` and does not use `async`/`await`.
