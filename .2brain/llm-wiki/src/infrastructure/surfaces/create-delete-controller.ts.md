---
source: src/infrastructure/surfaces/create-delete-controller.ts
sha256: c78c37bbdbdd7c1bc069eb773f8fa45c2b005a3c4457f492e3ae8bc7ce823639
generated_at: 2026-09-27T14:16:59.717656+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-delete-controller.ts

## Purpose

Factory that produces the shared `DELETE /x/:id` / `DELETE /x/:id/hard` controller for any entity. Each module keeps a thin `delete-<entity>.ts` file that calls this factory with a four-field spec (entity name, service call, audit action, not-found key), so the common id-extraction, `hardDelete` flag merging, validation, audit recording, and error-envelope logic lives in one place.

## Key elements

- **`DeleteControllerSpec`** (interface) — the per-entity differences: `entity` (lower-case singular, e.g. `'order'`), `remove` (service call taking `id` + `hardDelete`), `auditAction` (fixed string or `(hardDelete) => string`), `notFoundKey` (i18n key for 404).
- **`createDeleteController`** (exported const) — accepts a `DeleteControllerSpec`, returns an Express handler named `delete<Entity>` (e.g. `deleteOrder`). Internally: validates `:id`, merges `hardDelete` from path/query/body (any-true-wins OR), validates via `hardDeleteSchema`, calls `remove`, records audit on success, maps the service's not-found error to a 404 envelope.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides the handler scaffolding utilities used throughout: `namedHandler`, `operationName`, `refused`, `rejectValidation`, `catchAsNotFound`, and the `ServiceResult` type.
- **`src/infrastructure/http/request.ts`** — provides `extractAndValidateId` (422 on missing/malformed `:id`), `readInput` (multi-surface flag reading), and `callerContextOf` (audit context extraction).
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for the 200 envelope.
- **`src/infrastructure/http/schemas.ts`** — provides `hardDeleteSchema` for validating the merged `hardDelete` value.
- **`src/infrastructure/observability/audit.ts`** — provides `recordAudit` and the `AuditAction` type for the post-success audit entry.
- **`src/modules/orders/controllers/delete-orders.ts`**, **`src/modules/products/controllers/delete-products.ts`**, **`src/modules/users/controllers/delete-users.ts`** — consumer modules; each calls `createDeleteController` with its own spec. The `users` module uses the function form of `auditAction` to emit different action strings for soft vs. hard delete.

## Notes

- `hardDelete` is **OR'd** across all surfaces (path segment, query, body) rather than following a single-surface precedence rule. Rationale: `false` is the default nobody types, so letting it override an explicit `true` on another transport would be surprising.
- The handler's function name is set via `namedHandler` with a computed key (`deleteOrder`, `deleteProduct`, …) so stack traces, request logs, and generated `docs/modules/` tables all show the entity-specific name.
- `entity` is used for both the audit `target_type` and the operation log name; keeping them derived from the same string prevents drift.
- The `remove` service call returns a `ServiceResult`; the controller only inspects `result.message` on success and delegates all failure-shape mapping to `refused` / `catchAsNotFound`.
