---
source: src/modules/audit-logs/controllers/get-audit.ts
sha256: a6bae4123174530a9678bfc02b9aef00fb6df9c139ffb8eeb2db51e641c93704
generated_at: 2026-10-15T10:21:49.947154+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/controllers/get-audit.ts

## Purpose

Defines the tenant-scoped `GET /audit` controller, returning a filtered, paged list of the shop's own action history. It is the tenant-key counterpart to the platform's `listObservabilityAuditEntries`; both ultimately read the same collection through `auditLogService`.

## Key elements

- **`getAudit`** (exported) — the controller, built with the `createListController` factory. Configures the entity name, validation schema, and a `runList` callback that calls `auditLogService.search`.
- **Schema** — `ListAuditEntriesQueryParams` extended with `page`/`pageSize` (infra schemas), then made `.partial()` so every query param is optional. The generated `outcome` enum (`success` / `failure`) is kept strict.
- **`runList` callback** — spreads the parsed params into `auditLogService.search` and converts `since` from a string to a `Date` (passing `undefined` when absent).

## Relationships

- **`@infrastructure/http/schemas`** — supplies `pageSchema` and `pageSizeSchema`, the canonical pagination query-param definitions used here instead of the API-level versions.
- **`@infrastructure/surfaces/create-list-controller`** — the `createListController` factory that wraps schema validation, pagination normalization (`normalizePagination`), and response shaping around the `runList` call.
- **`src/modules/audit-logs/routes.ts`** — mounts `getAudit` at the `/audit` route.
- **`src/modules/audit-logs/service.ts`** — provides `auditLogService.search`, the actual data-access call this controller delegates to.

## Notes

- All query params are optional (`.partial()`). An absent `page`/`pageSize` stays absent so `normalizePagination` inside `createListController` can apply its own defaults — the controller does not supply fallback values.
- `since` arrives as a string (Zod schema) and is cast to `Date` only at the service-call site; the schema layer never sees a `Date` object.
- Invalid `outcome` values are rejected with **422** by the generated enum rather than silently matching every row.
