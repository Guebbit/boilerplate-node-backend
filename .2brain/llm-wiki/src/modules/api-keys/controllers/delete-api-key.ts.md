---
source: src/modules/api-keys/controllers/delete-api-key.ts
source_sha256: c4c38cfe99f53bc65a2fc6f430391aff9929c33af8dd8b8575bcf6c984e99ae5
context_sha256: d40b55a7e974cd16bce86db9e65487d52199c85272a13b9615fea16f65214378
generated_at: 2026-11-22T04:20:31.456502+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/controllers/delete-api-key.ts

## Purpose
Express controller for `DELETE /api-keys/:id`. It revokes an API key (a credential). It is hand-written rather than built with `createDeleteController`, because that factory targets the soft/hard delete triplet, and a revoke is a state change with no hard-delete counterpart.

## Key elements
- `revokeApiKey(request, response)`: the exported handler.
  - Validates the `:id` param with `requireId`. A malformed id gets the `generic.error-item-gone` not-found message, before any database call.
  - Calls the `revokeApiKey` method of `apiKeysService` with the id and `tenantCallerContextOf(request)`.
  - If `refused(response, result)` reports the service refused the call, the handler returns without sending its own response.
  - Otherwise it answers `204` via `noContentResponse`.
  - Rejections go to `catchAs(response, 'revokeApiKey')`.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `refused` (handles refused service results) and `catchAs` (error handler tagged with the operation name).
- `src/infrastructure/http/ids.ts`: `requireId` parses and validates the route id.
- `src/infrastructure/http/request.ts`: `tenantCallerContextOf` builds the tenant/caller context passed to the service.
- `src/infrastructure/http/response.ts`: `noContentResponse` sends the 204.
- `src/modules/api-keys/services/index.ts`: exports `apiKeysService`, whose `revokeApiKey` method performs the revocation.
- `src/modules/api-keys/routes.ts`: the route layer that wires this handler to `DELETE /api-keys/:id`. This file does not import it.

## Notes
- The operation is idempotent: revoking an already-revoked key still returns 204.
- The handler returns early without a value when the id is invalid, because `requireId` has already written the response.
