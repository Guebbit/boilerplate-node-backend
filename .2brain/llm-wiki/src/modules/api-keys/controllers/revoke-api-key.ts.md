---
source: src/modules/api-keys/controllers/revoke-api-key.ts
sha256: fc6843f1a9c498322fb354999a3997c1056dcc231efd879565cffbe698659107
generated_at: 2026-09-23T18:23:50.596418+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/controllers/revoke-api-key.ts

## Purpose

Controller handler for `DELETE /api-keys/:id`. It performs a **revoke** — a soft state change on an API key credential — which is distinct from the soft/hard-delete triplet that the generic `createDeleteController` factory handles. Revoking an already-revoked key is idempotent (still returns 200).

## Key elements

- **`revokeApiKey`** (exported) — The sole export. Accepts an Express `Request<{ id: string }>` and `Response`. Validates the path-param `id` as an ObjectId, delegates to `apiKeysService.revokeApiKey`, and renders either a refusal or a 200 success with a service-provided message.

## Relationships

- **`src/infrastructure/http/request.ts`** — Supplies `extractAndValidateId` (parses and validates the `:id` path param, short-circuits with an error response if invalid) and `tenantCallerContextOf` (extracts tenant/caller metadata from the request for the service call).
- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs` (maps unexpected exceptions to an error response) and `refused` (inspects the service result and writes an appropriate refusal response if the operation was denied).
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, used to write the 200 JSON body with the service's `result.message`.
- **`src/modules/api-keys/services/index.ts`** — Exports `apiKeysService`; this controller calls its `revokeApiKey(id, callerContext)` method, which performs the actual state transition.
- **`src/modules/api-keys/routes.ts`** — Registers `revokeApiKey` as the handler for the `DELETE /api-keys/:id` route.

## Notes

- **Hand-written, not factory-generated.** The module docblock explicitly states this controller is _not_ built on `createDeleteController` because revoke is a state change without a hard-delete counterpart. Do not expect the same shape or helpers as other delete endpoints.
- **ID validation precedes the service call.** `extractAndValidateId` guarantees the `id` is a well-formed ObjectId before `apiKeysService.revokeApiKey` is invoked, so the service's `catchAs` handler will never see a `CastError`.
- **Idempotent by design.** Revoking an already-revoked key still resolves to 200; there is no 404/409 branch for the "already revoked" case.
