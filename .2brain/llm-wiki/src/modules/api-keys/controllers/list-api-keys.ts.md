---
source: src/modules/api-keys/controllers/list-api-keys.ts
sha256: 047b374418bbdfba27022112a3bb1cf7d804c9521fb3bc6b30db24f7f4233d9e
generated_at: 2026-09-23T18:23:32.008942+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/controllers/list-api-keys.ts

## Purpose

Thin HTTP controller that handles `GET /api-keys`. It validates pagination query params, extracts the tenant's caller context from the request, and delegates to the API-keys service. The resulting list is ordered newest-first and never includes secret material.

## Key elements

- **`listApiKeys`** (exported) — The list-controller instance produced by `createListController`. Accepts a parsed pagination query and a raw HTTP request; returns a `Promise<ApiKeysResponse>`.
- **`entity: 'apiKeys'`** — Identifier passed to the list-controller factory (used for logging, response metadata, or cache keys depending on the factory's implementation).
- **`schema: paginationSchema`** — Query-parameter validation schema applied before `runList` is invoked.

## Relationships

- **`src/infrastructure/surfaces/create-list-controller.ts`** — Factory used to build the controller; provides the standard list-endpoint contract (validation, error handling, response shaping).
- **`src/infrastructure/http/schemas.ts`** — Source of `paginationSchema`, the shared pagination query schema.
- **`src/infrastructure/http/request.ts`** — Source of `tenantCallerContextOf`, which extracts the tenant-scoped caller context from the incoming request.
- **`src/modules/api-keys/services/index.ts`** — Exposes `apiKeysService`, whose `listApiKeys` method performs the actual data retrieval.
- **`src/modules/api-keys/routes.ts`** — Registers `listApiKeys` on the `GET /api-keys` route.
- **`src/types/index.ts`** — Defines the `ApiKeysResponse` shape returned to the client.

## Notes

- The controller is deliberately stateless and contains no business logic; all listing behavior lives in `apiKeysService.listApiKeys`.
- "Never returns a secret" is a contract enforced at the service layer, not by this controller—review the service if you need to confirm which fields are redacted.
