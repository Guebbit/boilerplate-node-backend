---
source: src/modules/observability/controllers/get-observability-audit.ts
source_sha256: d09afcad559f43c989684329e5fd81bcd620e8f1dcf0a7c0189ae38cfba5c402
context_sha256: 26b57b986d9379d7f45d1536b22e1ea22597b3233d1ce8e8ac8159de9a1a424a
generated_at: 2026-11-22T06:00:29.308031+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/controllers/get-observability-audit.ts

## Purpose
Controller for `GET /observability/audit`. It returns a filtered, paged list of the platform's incident audit events (security refusals, failed sign-ins, worker failures), with each address pseudonymised. It is the one place the observability module reads beyond its own process snapshot, which is why it depends on `audit-logs`. It is operator-facing and exposes incidents only, not what a shop's customers did (that is the admin's `GET /audit`).

## Key elements
- `getObservabilityAuditLogs`: the exported controller, built with `createListController`.
  - `entity: 'observabilityAuditLogs'`.
  - `schema`: `ListObservabilityAuditEntriesQueryParams` (generated from `@api/schemas.zod`), extended with the infra `pageSchema` and `pageSizeSchema`, then made `.partial()`.
  - `runList`: calls `auditLogService.searchIncidents` with the parsed query. `since` is converted to a `Date` when present, otherwise `undefined`.
- Supported filters: actor, action, outcome and since.

## Relationships
- `src/infrastructure/surfaces/create-list-controller.ts`: supplies the `createListController` factory that turns `entity`, `schema` and `runList` into the handler.
- `src/infrastructure/http/schemas.ts`: provides `pageSchema` and `pageSizeSchema`, which replace the generated `page`/`pageSize` fields.
- `src/modules/audit-logs/index.ts`: exports `auditLogService`, the module's public entry point.
- `src/modules/audit-logs/service.ts`: implements `searchIncidents`, which `runList` calls. It is reached through the module index.
- `src/modules/observability/routes.ts`: the neighbor that wires this controller to the `/observability/audit` route.

## Notes
- The generated `outcome` enum rejects values other than `success` or `failure` with a 422. Without it the filter would silently match every row.
- `page` and `pageSize` are swapped for the infra schemas and the whole schema is made partial. An absent value stays absent, so `normalizePagination` can apply its defaults.
- `since` is passed as a string and converted to a `Date` here, not in the schema.
