# src/modules/observability/controllers/get-observability-audit.ts

## Purpose

Controller handler for `GET /observability/audit`. It provides a filtered, paged read over the `audit-logs` collection — the single point where the observability module reaches outside its own process snapshot, and the sole reason it depends on `audit-logs`.

## Key elements

- **`getObservabilityAuditLogs(request, response)`** — exported handler. Reads query-string input (`actor`, `action`, `outcome`, `since`) via `readInput` with `surface: 'list'`, parses pagination via `parseBody(paginationSchema, …)`, validates `since` as a `Date` (422 on `NaN`), whitelists `outcome` to `'success' | 'failure'` (anything else → no filter), then delegates to `auditLogService.search(…)`. Errors are funnelled through `catchAs(response, 'getObservabilityAuditLogs')`.

## Relationships

- **`@infrastructure/http/controller`** (`catchAs`, `parseBody`) — shared HTTP utilities for error handling and schema-parsed input extraction.
- **`@infrastructure/http/request`** (`readInput`) — canonical input-reading boundary; this handler never touches `request.query` directly.
- **`@infrastructure/http/response`** (`successResponse`, `rejectResponse`) — uniform JSON envelope for 200 and 422 responses.
- **`@infrastructure/http/schemas`** (`paginationSchema`) — defines the shape/bounds of `page` / `pageSize`.
- **`@infrastructure/i18n`** (`t`) — localises the `observability.audit-since-invalid` error message.
- **`@modules/audit-logs`** (`auditLogService`) — the data-access service whose `.search()` method performs the actual Mongo query.
- **`src/modules/observability/routes.ts`** — registers this handler on the `GET /observability/audit` route.

## Notes

- `ids: ['actor', 'action', 'outcome', 'since']` in the `readInput` call collapses repeated query params (e.g. `?since=1&since=2`) to the **first** value, preventing `new Date(array)` from producing `NaN` via an unexpected array.
- `outcome` is explicitly narrowed to the two-enum whitelist before hitting Mongo. An unrecognised value becomes `undefined` (no filter) rather than being passed verbatim, which would otherwise match nothing *or* — depending on Mongo operator misuse — match everything.
- Pagination failures return **422** (broken request), not a silently-clamped page. `normalizePagination` (inside `parseBody`) still handles the absent-page default.
- The `ids` declaration makes these four params arrive as plain strings even though `readInput`'s return type is `unknown`; the handler relies on that contract rather than runtime checks.
