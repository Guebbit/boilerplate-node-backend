---
source: src/modules/api-keys/controllers/get-api-keys.ts
source_sha256: d7668e131b9423abd9035216d5c25320ba8f1bb4f28b7aa92a17800b03670e0a
context_sha256: fb3b42f542dc8ed4e0ab228054ee8d97e0ae7b69abc2ce47d484d7899e6461c2
generated_at: 2026-11-22T04:20:42.078315+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/controllers/get-api-keys.ts

## Purpose
Controller for `GET /api-keys`. It lists the calling tenant's API keys (newest first unless `sort` says otherwise) and never returns a secret. The file only declares the query-parameter schema and delegates the work to the API keys service.

## Key elements
- `listApiKeys`: the exported controller, built with `createListController`.
  - `entity: 'apiKeys'` identifies the list entity.
  - `schema` is `ListApiKeysQueryParams` (from `@api/schemas.zod`), extended so `page` and `pageSize` use the infrastructure `pageSchema` and `pageSizeSchema`, then made `.partial()`. This keeps an absent `page` or `pageSize` absent instead of defaulted.
  - `input: { csvLists: ['sort'] }` makes the `sort` query param split on commas.
  - `runList(parsed, request)` calls `apiKeysService.listApiKeys(tenantCallerContextOf(request), parsed)` and returns `Promise<ApiKeysResponse>`.

## Relationships
- `src/infrastructure/surfaces/create-list-controller.ts`: provides the `createListController` factory that turns this config into the actual handler.
- `src/infrastructure/http/schemas.ts`: supplies `pageSchema` and `pageSizeSchema`.
- `src/infrastructure/http/request.ts`: supplies `tenantCallerContextOf`, which derives the tenant caller context from the request.
- `src/modules/api-keys/services/index.ts`: supplies `apiKeysService`, whose `listApiKeys` does the listing.
- `src/types/index.ts`: supplies the `ApiKeysResponse` type (imported from `@types`).
- `src/modules/api-keys/routes.ts`: the route module that wires `GET /api-keys` to this controller.

## Notes
- The listing is scoped to the tenant through the caller context, not through a query parameter.
- `.partial()` applies to the whole extended schema, so every query parameter is optional.
