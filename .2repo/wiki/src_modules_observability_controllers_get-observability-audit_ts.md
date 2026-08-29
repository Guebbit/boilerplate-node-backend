# src/modules/observability/controllers/get-observability-audit.ts

## Purpose

HTTP handler for `GET /observability/audit`. Accepts a paginated, filterable query string (actor, action, outcome, since) and delegates to the audit-log service to return one page of matching audit events.

## Key elements

- **`getObservabilityAuditLogs(request, response)`** — sole export. Reads the query surface via `readInput` (surface `'list'`, ids: `actor`, `action`, `outcome`, `since`), validates and normalizes pagination with `parseBody(paginationSchema, …)`, validates the `since` date, coerces `outcome` to the `'success' | 'failure'` enum (or `undefined`), then calls `auditLogService.search(…)` and streams the result through `successResponse` / `catchAs`.

## Relationships

- **`@infrastructure/http/request` → `readInput`** — normalizes the raw Express query string into typed, scalar input values.
- **`@infrastructure/http/controller` → `parseBody`, `catchAs`** — pagination validation (returns 422 early) and async error capture for the service call.
- **`@infrastructure/http/response` → `successResponse`, `rejectResponse`** — all HTTP responses in this handler go through these helpers.
- **`@infrastructure/http/schemas` → `paginationSchema`** — defines the `page` / `pageSize` shape and bounds.
- **`@infrastructure/i18n` → `t`** — localizes the `observability.audit-since-invalid` error message.
- **`@modules/audit-logs` → `auditLogService`** — the domain service whose `.search()` method performs the actual Mongo query.
- **`src/modules/observability/routes.ts`** — registers this handler on the `/observability/audit` GET route.

## Notes

- `ids` in `readInput` collapses repeated query params (e.g. `?since=a&since=b`) to the first value, preventing `new Date([…])` from producing `NaN` silently.
- `outcome` is whitelisted to `'success'` / `'failure'`; any other value is coerced to `undefined` (no filter) rather than passed to the repository, so an unrecognised value never degenerates into "match everything."
- Invalid pagination or an unparseable `since` date both yield a **422** (broken request), not a silent rewrite.
- The handler is intentionally thin: it owns input normalization, validation, and response shape, but no domain logic beyond the `outcome` enum guard.
