---
source: src/modules/audit-logs/controllers/get-audit.ts
sha256: ed7d761459f0af28f02d50f9d4a97cea5d51751a55870fbafe259f6a695f9070
generated_at: 2026-11-08T05:07:31.733774+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/controllers/get-audit.ts

## Purpose

Single-file controller for `GET /audit`. It exposes this shop's own action history as a filtered, paged list, using the same underlying collection that `observability`'s `listObservabilityAuditEntries` serves but keyed by a tenant rather than a platform token (see `../service.ts` for the shared-collection rationale).

## Key elements

- **`getAudit`** (exported const) — The route handler, built via `createListController`. Declares:
  - `entity: 'auditEntries'` — the collection the lister reads from.
  - `schema` — `ListAuditEntriesQueryParams` extended with infra `pageSchema` / `pageSizeSchema`, then `.partial()` so every field is optional (absent pagination is defaulted later by `normalizePagination`).
  - `input.booleans: ['ownOrder']` — pre-decodes the raw `"true"` / `"false"` string before zod validation.
  - `runList` — delegates to `auditLogService.search`, converting `since` from a string to a `Date` (or `undefined`).

## Relationships

- **`src/infrastructure/http/schemas.ts`** — Imports `pageSchema` and `pageSizeSchema` to replace the API-level page fields with the canonical infra pair.
- **`src/infrastructure/surfaces/create-list-controller.ts`** — Imports the `createListController` factory that assembles the HTTP handler, pagination defaulting, and boolean decoding around the supplied config.
- **`src/modules/audit-logs/routes.ts`** — Consumes `getAudit` to register it on the `GET /audit` route.
- **`src/modules/audit-logs/service.ts`** — Provides `auditLogService.search`, the single data-access call this controller makes.

## Notes

- The `outcome` filter is a generated enum (`success` | `failure`); any other value produces a 422 rather than silently matching every row.
- All query params are optional (`.partial()`), so a request with no params is valid; `normalizePagination` inside the controller factory supplies defaults.
- `since` is the only field that undergoes a type coercion (`string → Date`) in `runList`; everything else passes through as-parsed.
