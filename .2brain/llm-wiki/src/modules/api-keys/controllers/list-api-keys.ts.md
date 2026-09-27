---
source: src/modules/api-keys/controllers/list-api-keys.ts
sha256: 5492ca9404df3a58f92753e2621851d333e07975788c614570fb4cbc756c973e
generated_at: 2026-09-27T14:40:44.571391+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/controllers/list-api-keys.ts

## Purpose

HTTP controller for `GET /api-keys`. Returns the calling tenant's API-key credentials in newest-first order, with pagination. Secrets are never included in the response.

## Key elements

- **`listApiKeys`** (exported) — The route handler, built via `createListController`. Accepts a paginated query (validated by `paginationSchema`), extracts the tenant caller context from the request, and delegates to `apiKeysService.listApiKeys`. Returns `Promise<ApiKeysResponse>`.

## Relationships

- **`@infrastructure/surfaces/create-list-controller`** — Provides the `createListController` factory that wires query-parsing, validation, and response formatting around the `runList` callback.
- **`@infrastructure/http/schemas`** — Supplies `paginationSchema`, used to validate the incoming query parameters (page, limit, etc.).
- **`@infrastructure/http/request`** — Supplies `tenantCallerContextOf`, which derives the tenant-scoped caller context from the raw `request` object.
- **`@types`** — Supplies the `ApiKeysResponse` type used as the return type of `runList`.
- **`../services`** (api-keys service index) — Provides `apiKeysService`, the domain service whose `listApiKeys` method performs the actual data retrieval.
- **`src/modules/api-keys/routes.ts`** — The routes file that registers `listApiKeys` on the `GET /api-keys` path.

## Notes

- Ordering (newest first) and the "no secrets" guarantee are stated in the doc comment but are enforced by the service layer, not this controller.
- The controller is intentionally thin: all domain logic lives in `apiKeysService`. Pagination and auth-context extraction are the only controller-level concerns.
