---
source: src/modules/observability/controllers/get-observability-audit.ts
sha256: d0216af56e5bda1d5583037a366c22a092ea0528388efe1c61921e128ff49ed6
generated_at: 2026-10-15T10:54:17.518698+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-audit.ts

## Purpose

Controller for `GET /observability/audit`. It exposes a filtered, paged read over the **incident** subset of the `audit-logs` collection (security refusals, failed sign-ins, worker failures). It is the single point where the observability module depends on `audit-logs`, and the only place it reaches beyond its own process snapshot.

## Key elements

- **`getObservabilityAuditLogs`** (exported const) — A list controller produced by `createListController`. Configured with:
  - `entity: 'observabilityAuditLogs'` — the entity name for route/tooling identification.
  - `schema` — `ListObservabilityAuditEntriesQueryParams` extended with `pageSchema` / `pageSizeSchema`, then made fully `.partial()` so every query param is optional.
  - `runList` — delegates to `auditLogService.searchIncidents`, converting the optional `since` string to a `Date` (or `undefined`).

## Relationships

- **`src/infrastructure/surfaces/create-list-controller.ts`** — provides the `createListController` factory that wraps the schema + `runList` into a standard paged-list HTTP handler.
- **`src/infrastructure/http/schemas.ts`** — supplies `pageSchema` and `pageSizeSchema`, the shared pagination param definitions used in place of the generated ones.
- **`src/modules/audit-logs/index.ts`** / **`src/modules/audit-logs/service.ts`** — source of `auditLogService`; its `searchIncidents` method performs the actual filtered query. This is the module's only cross-module dependency.
- **`src/modules/observability/routes.ts`** — registers `getObservabilityAuditLogs` on the `GET /observability/audit` route.

## Notes

- All query params are optional (`.partial()`); an absent `page`/`pageSize` is deliberately left as `undefined` so `normalizePagination` (inside `createListController`) can apply its defaults.
- The `outcome` filter is constrained to the generated enum (`success` / `failure`); anything else yields a **422** rather than silently matching every row.
- Addresses in returned records are **pseudonymised** — the operator sees incidents, never raw customer actions (that is the admin's `GET /audit` concern).
- `since` arrives as a string from the query; the controller converts it to `Date` before handing off to the service.
