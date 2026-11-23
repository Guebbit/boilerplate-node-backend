---
source: src/modules/audit-logs/controllers/get-audit.ts
source_sha256: 653c5e777331699b2e9e45e63fa279dbb8db9a81d61e7cd0b778aa51a2ffbac6
context_sha256: 57b0cd9830c3639f588af68d8b04e7484de215622a5abb15147570ee40f46853
generated_at: 2026-11-22T04:26:20.889747+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/audit-logs/controllers/get-audit.ts

## Purpose
Controller for `GET /audit`. It returns a filtered, paged page of the shop's own action history (audit entries). It serves the same read that `observability`'s `getObservabilityAuditLogs` provides, but is reached with a tenant key instead of a platform key.

## Key elements
- `getAudit`: the exported controller, built with `createListController` for the `auditEntries` entity.
  - `schema`: the generated `ListAuditEntriesQueryParams` extended with the infra `pageSchema` and `pageSizeSchema`, then made `.partial()`. An absent `page` or `pageSize` stays absent so `normalizePagination` can default it. The generated `outcome` enum rejects values other than `success` or `failure` with a 422 rather than silently matching every row.
  - `input: { booleans: ['ownOrder'] }`: decodes the string `true`/`false` query value for `ownOrder` before schema validation.
  - `runList`: calls `auditLogService.search` with the parsed params, converting `since` to a `Date` when present and leaving it `undefined` otherwise.

## Relationships
- `src/infrastructure/surfaces/create-list-controller.ts`: supplies the `createListController` factory that wires the entity, schema, input decoding and `runList` into a handler.
- `src/infrastructure/http/schemas.ts`: provides `pageSchema` and `pageSizeSchema`, used in place of the generated pagination fields.
- `src/modules/audit-logs/service.ts`: exports `auditLogService`, whose `search` method performs the actual query that `runList` delegates to.
- `src/modules/audit-logs/routes.ts`: the module's routes file, which is where this controller is wired to `GET /audit`.

## Notes
- `since` is converted to a `Date` before reaching the service, so the service receives a `Date` rather than the raw string.
