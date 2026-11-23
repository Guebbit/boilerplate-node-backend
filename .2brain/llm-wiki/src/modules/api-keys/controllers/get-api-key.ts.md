---
source: src/modules/api-keys/controllers/get-api-key.ts
source_sha256: 0751d9c16d8f884de1f6316098959eb9987819c68c3ce6c21cfff7f9ee613ec2
context_sha256: f3591014b74f894246cb44698b5ca12ad92372446f69a7fc4d10ec3d056fe9c4
generated_at: 2026-11-22T04:20:36.761581+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/controllers/get-api-key.ts

## Purpose
Express controller for `GET /api-keys/:id`. It returns a single API key (credential) belonging to the calling tenant, never including its secret. A malformed id, an unknown id, and another tenant's id all produce the same 404 response.

## Key elements
- `getApiKey(request, response)` is the exported handler.
  - It validates the `:id` param with `requireId`, using the `generic.error-item-gone` not-found message. If validation fails it returns `Promise.resolve()` and the response has already been handled.
  - It calls `apiKeysService.getApiKey(id, tenantCallerContextOf(request))`.
  - If `refused(response, result)` handles the result, it stops. Otherwise it sends `successResponse<ApiKey>(response, result.data, 200)`.
  - Rejections go to `catchAs(response, 'getApiKey')`.

## Relationships
- `src/infrastructure/http/ids.ts`: supplies `requireId`, which parses and validates the route id.
- `src/infrastructure/http/request.ts`: supplies `tenantCallerContextOf`, which builds the tenant caller context passed to the service.
- `src/infrastructure/http/response.ts`: supplies `successResponse`, used for the 200 reply.
- `src/infrastructure/http/controller.ts`: supplies `refused` (handles service-level refusals) and `catchAs` (error handling for rejected promises).
- `src/modules/api-keys/services/index.ts`: provides `apiKeysService`, which does the actual lookup.
- `src/types/index.ts`: provides the `ApiKey` type for the response payload.
- `src/modules/api-keys/routes.ts`: the route file that registers this handler for `GET /api-keys/:id`.

## Notes
- The handler always returns a Promise, including on the early-return path.
- The controller adds no tenant-scoping or 404 logic of its own. The 404 behavior comes from `requireId` and the service result via `refused`, with tenant scoping carried by the caller context.
