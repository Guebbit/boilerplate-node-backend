---
source: src/modules/api-keys/controllers/list-api-keys.ts
sha256: 4198ce15fbd6682a10cf911282ff480f58617f05d8b075507cb2ba5d4151ab14
generated_at: 2026-10-29T03:12:36.734519+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/controllers/list-api-keys.ts

## Purpose

Thin HTTP controller for `GET /api-keys`. It wires request parsing, tenant-context extraction, and service delegation into a single list-endpoint handler built via the shared list-controller factory.

## Key elements

- **`listApiKeys`** (export) — The only export. A list-controller produced by `createListController` that validates query params, then calls `apiKeysService.listApiKeys` with the tenant caller context and parsed params. Returns `Promise<ApiKeysResponse>`.
- **`schema`** (inline) — Extends `ListApiKeysQueryParams` with `pageSchema` / `pageSizeSchema` and applies `.partial()`, so every query param is optional.
- **`input: { csvLists: ['sort'] }`** — Tells the list-controller to split the `sort` query param on commas into an array before passing it to `runList`.

## Relationships

- **`@infrastructure/surfaces/create-list-controller`** — Supplies the `createListController` factory that handles HTTP plumbing (status codes, error mapping) and exposes only the `runList` callback to this file.
- **`@infrastructure/http/schemas`** — Provides `pageSchema` and `pageSizeSchema`, substituted in place of the module-level `page`/`pageSize` fields so an absent value remains `undefined` rather than defaulting.
- **`@infrastructure/http/request`** — Provides `tenantCallerContextOf(request)`, used to derive the tenant-scoped context passed to the service.
- **`../services/index`** — Exports `apiKeysService`, whose `listApiKeys` method performs the actual data retrieval.
- **`@types`** — Supplies the `ApiKeysResponse` return type.
- **`../routes.ts`** — Registers this controller on the `GET /api-keys` route within the api-keys module.

## Notes

- The doc comment explicitly states the response **never includes a secret value**; that guarantee lives in the service layer, not here.
- `page` and `pageSize` are intentionally swapped for the infrastructure schemas (not the module's own) so that omitting either leaves it absent rather than coercing to a default.
- The file is a pure composition point: no business logic, no DB access.
