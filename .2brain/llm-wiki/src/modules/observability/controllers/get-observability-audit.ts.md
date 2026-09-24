---
source: src/modules/observability/controllers/get-observability-audit.ts
sha256: dbc660b06f4d42a36457418b14690a66eb6d460a7a6dd9f55d2a57075ec7cddc
generated_at: 2026-09-23T18:55:23.414434+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-audit.ts

## Purpose

Controller for `GET /observability/audit`. It exposes a filtered, paged view of the shared audit-logs collection, making this the sole point where the observability module reads beyond its own process snapshot. It exists so dashboards or API consumers can query historical audit events (by actor, action, outcome, time range) without coupling directly to the audit-logs module.

## Key elements

- **`getObservabilityAuditLogs`** (default export) — The list controller instance built via `createListController`. Bound to entity `'observabilityAuditLogs'`. Accepts optional filters `actor`, `action`, `outcome`, `since` plus pagination, then delegates to `auditLogService.search()`.
- **Schema** — `GetObservabilityAuditLogsQueryParams.extend({ page: pageSchema, pageSize: pageSizeSchema }).partial()`. All fields are optional; the generated `outcome` enum validates strictly to `success | failure` (anything else → 422).
- **`runList` callback** — Spreads parsed params into `auditLogService.search`, converting the `since` query-string to a `Date` (or `undefined` if absent).

## Relationships

- **`src/infrastructure/surfaces/create-list-controller.ts`** — Provides the `createListController` factory that assembles validation, pagination, and response shaping; this file supplies the entity name, schema, input field list, and `runList` function.
- **`src/infrastructure/http/schemas.ts`** — Source of `pageSchema` and `pageSizeSchema`, the infra-level pagination fields that replace the raw `page`/`pageSize` from the API schema so `normalizePagination` can apply defaults.
- **`src/modules/audit-logs/index.ts`** — Barrel import target; re-exports `auditLogService` used as the data-access layer.
- **`src/modules/audit-logs/service.ts`** — `auditLogService.search()` is the actual query executed; this controller is its only caller in the observability module.
- **`src/modules/observability/routes.ts`** — Mounts `getObservabilityAuditLogs` on the `GET /observability/audit` route.

## Notes

- The schema is `.partial()`, so _every_ filter including pagination is optional. The swap to `pageSchema`/`pageSizeSchema` (rather than the raw API-schema fields) is deliberate: it lets `createListController`'s `normalizePagination` treat a missing value as "use default" instead of passing `undefined` through.
- The `outcome` field is validated against a generated enum (`success` | `failure`). An invalid value returns **422**, not a silent match-all — this is a behavioral difference from a free-text filter and is called out in the in-file comment.
- `since` arrives as a query-string (ISO date); the conversion to `Date` happens in `runList`, not in the schema. If the audit-logs service ever expects a different type, this is the single adaptation point.
