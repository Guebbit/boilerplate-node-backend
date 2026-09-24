---
source: src/modules/audit-logs/controllers/get-audit.ts
sha256: 6091227f9f1bb24fb0dec9b81ed37dee6c936dd83ef990ceeb18062d7f4a742c
generated_at: 2026-09-23T18:26:22.458737+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/controllers/get-audit.ts

## Purpose

Single-export controller that handles `GET /audit`, returning a filtered, paginated list of the tenant's own action-history entries. It mirrors the read path used by the `observability` module's `getObservabilityAuditLogs`, differing only in authentication scope (tenant key vs. platform key) — both ultimately query the same collection via `auditLogService`.

## Key elements

- **`getAudit`** (exported const) — Built by `createListController`. Configured with:
    - `entity: 'auditEntries'`
    - `schema` — `ListAuditEntriesQueryParams` (from `@api/schemas.zod`) extended to swap in the infra `page`/`pageSize` schemas, then `.partial()` so absent pagination fields stay absent for downstream defaulting.
    - `input` — maps the controller's positional/filter params to the service fields: `actor`, `action`, `outcome`, `target`, `since`.
    - `runList` — calls `auditLogService.search`, converting `since` from a string to a `Date` when present.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — Source of `pageSchema` and `pageSizeSchema`, which replace the API-schema versions so that missing pagination params remain `undefined` for `normalizePagination` to apply defaults.
- **`src/infrastructure/surfaces/create-list-controller.ts`** — Factory that wraps the schema-validation → `runList` invocation into a standard list-handler shape; this file supplies the configuration object.
- **`src/modules/audit-logs/routes.ts`** — Registers `getAudit` on the `GET /audit` route (the consumer of this export).
- **`src/modules/audit-logs/service.ts`** — Provides `auditLogService.search`, the single data-access call the controller delegates to.

## Notes

- The `outcome` filter is a generated enum (`success` | `failure`); any other value is rejected with **422** at schema-validation time rather than silently matching all rows.
- `since` arrives as a string (or absent) in the query params and is only converted to `Date` inside `runList`; the service layer therefore always receives a `Date` or `undefined`.
- `page`/`pageSize` are deliberately swapped to the infra schemas (not the API-schema equivalents) so that an absent value stays `undefined` instead of defaulting early, preserving the "absent means let `normalizePagination` decide" convention.
