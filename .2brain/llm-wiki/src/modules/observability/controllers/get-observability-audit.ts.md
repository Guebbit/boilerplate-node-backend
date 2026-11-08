---
source: src/modules/observability/controllers/get-observability-audit.ts
sha256: d0216af56e5bda1d5583037a366c22a092ea0528388efe1c61921e128ff49ed6
generated_at: 2026-11-08T06:38:19.455887+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-audit.ts

## Purpose

Controller for `GET /observability/audit`. Provides a paged, filtered read over the **incident** subset of the `audit-logs` collection (security refusals, failed sign-ins, worker failures). It is the sole reason the observability module depends on `audit-logs`, and it deliberately scopes to platform incidents — not per-customer activity, which is the admin's `GET /audit`.

## Key elements

- **`getObservabilityAuditLogs`** (export) — The controller, built with `createListController`. Registers entity `'observabilityAuditLogs'`, accepts a query-param schema, and delegates listing to `auditLogService.searchIncidents`.
- **Query-param schema** — `ListObservabilityAuditEntriesQueryParams.extend({ page, pageSize }).partial()`. All filters (actor, action, outcome, since, page, pageSize) are optional.
- **`runList` callback** — Spreads the parsed params into `auditLogService.searchIncidents`, converting the `since` string to a `Date` (or `undefined`).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/schemas.ts` | Imports `pageSchema` and `pageSizeSchema` for pagination params. |
| `src/infrastructure/surfaces/create-list-controller.ts` | Imports `createListController`, the factory that wires schema → `runList` into a route handler. |
| `src/modules/audit-logs/index.ts` | Imports `auditLogService` (the public barrel export). |
| `src/modules/audit-logs/service.ts` | `auditLogService.searchIncidents` is the underlying query executed for every request. |
| `src/modules/observability/routes.ts` | Mounts `getObservabilityAuditLogs` on `GET /observability/audit`. |

## Notes

- The `outcome` field is a **generated enum** limited to `success` / `failure`. Invalid values return **422** rather than silently matching every row — this is intentional and should not be "fixed" by widening the type.
- `.partial()` is applied to the *extended* schema, so even `page`/`pageSize` are optional; `normalizePagination` (inside `createListController`) supplies defaults when absent.
- `since` arrives as a string and is converted to `Date` only inside `runList`; the schema layer does not do this conversion.
- This file is the **only** place observability reaches beyond its own process snapshot into the audit-logs module.
