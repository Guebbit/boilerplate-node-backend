---
source: src/modules/api-keys/controllers/get-api-keys.ts
sha256: 4198ce15fbd6682a10cf911282ff480f58617f05d8b075507cb2ba5d4151ab14
generated_at: 2026-11-08T05:01:53.284294+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/controllers/get-api-keys.ts

## Purpose

Defines the single exported controller for `GET /api-keys`, returning the calling tenant's API keys (newest-first by default, or per `sort`). It is a thin adapter: it validates/parses query params and delegates the actual listing to the API-keys service. Never returns a key's secret.

## Key elements

- **`listApiKeys`** (export) — Built via the `createListController` factory with `entity: 'apiKeys'`. Its `runList` callback calls `apiKeysService.listApiKeys(tenantCallerContextOf(request), parsed)`.
- **Schema** — `ListApiKeysQueryParams` extended with infra `pageSchema`/`pageSizeSchema`, then `.partial()`, making every query param optional.
- **`input.csvLists: ['sort']`** — Tells the list-controller to split the `sort` query param on commas before passing it to `runList`.

## Relationships

- **`src/infrastructure/surfaces/create-list-controller.ts`** — Factory that wraps parsing, pagination, and HTTP response boilerplate into a single route handler.
- **`src/modules/api-keys/services/index.ts`** — Provides `apiKeysService`, whose `listApiKeys` method performs the actual data fetch.
- **`src/infrastructure/http/request.ts`** — Source of `tenantCallerContextOf`, used to derive the tenant identity from the incoming request.
- **`src/infrastructure/http/schemas.ts`** — Source of `pageSchema` and `pageSizeSchema`, the canonical pagination param validators.
- **`src/modules/api-keys/routes.ts`** — Registers `listApiKeys` on the `GET /api-keys` route (caller of this module's export).
- **`src/types/index.ts`** — Defines `ApiKeysResponse`, the typed return of `runList`.

## Notes

- The base `ListApiKeysQueryParams` (from `@api/schemas.zod`) already declares a `sort` field; the infra pagination pair *replaces* any ad-hoc pagination fields the base schema might carry. The `.partial()` at the end means omitting a param keeps it absent rather than defaulting.
- `runList` is async (`Promise<ApiKeysResponse>`); the service call is the sole `await` point.
- The "newest first" default ordering is a service-level concern — this controller does not impose it.
