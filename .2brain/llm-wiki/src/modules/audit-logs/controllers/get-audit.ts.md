---
source: src/modules/audit-logs/controllers/get-audit.ts
sha256: ed7d761459f0af28f02d50f9d4a97cea5d51751a55870fbafe259f6a695f9070
generated_at: 2026-10-29T03:17:14.123321+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/controllers/get-audit.ts

## Purpose

Controller for `GET /audit`. Returns a paginated, filtered page of the current shop's own action history (audit entries), accessed with a tenant key rather than a platform key. It answers the same query that `observability`'s `listObservabilityAuditEntries` does, but scoped to the tenant.

## Key elements

- **`getAudit`** (export) — the route handler, built via `createListController`. Accepts the query params `page`, `pageSize`, `since`, `outcome`, `ownOrder` (all optional). Calls `auditLogService.search` with the parsed params, converting `since` from a string to a `Date`.
- **`schema`** — `ListAuditEntriesQueryParams` extended with the infra `pageSchema`/`pageSizeSchema`, then `.partial()` so every field is optional.
- **`input.booleans: ['ownOrder']`** — decodes the string `"true"`/`"false"` value of `ownOrder` before schema validation.
- **`entity: 'auditEntries'`** — the entity label passed to the list-controller factory.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — provides `pageSchema` and `pageSizeSchema`, which replace the generated pagination fields so an absent value stays absent for `normalizePagination` to apply its default.
- **`src/infrastructure/surfaces/create-list-controller.ts`** — factory that assembles the request-parsing, validation, and response-shaping pipeline around `getAudit`'s `schema`, `input`, and `runList` options.
- **`src/modules/audit-logs/service.ts`** — exports `auditLogService`; its `.search` method is the sole data-access call made by the controller.
- **`src/modules/audit-logs/routes.ts`** — registers `getAudit` on the `GET /audit` endpoint.

## Notes

- All query params are optional (`.partial()`). Omitting `page`/`pageSize` is intentional — `normalizePagination` inside the list-controller factory supplies the defaults.
- The `outcome` field is a generated enum limited to `success` | `failure`; any other value yields a **422** rather than silently matching every row.
- `since` is passed through as a raw string to the schema (for validation) and only coerced to `Date` at the service-call boundary.
