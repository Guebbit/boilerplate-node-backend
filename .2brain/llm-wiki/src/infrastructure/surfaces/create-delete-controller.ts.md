---
source: src/infrastructure/surfaces/create-delete-controller.ts
sha256: 4920abcdf07d5673babac4df688fc0b145909e7ee64c8af5c9f80cdc7b9ce165
generated_at: 2026-09-23T17:53:26.844866+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-delete-controller.ts

## Purpose

Shared factory that builds the Express handler for a module's `DELETE /:id` and `DELETE /:id/hard` endpoints. Each module (orders, products, users) supplies a four-field spec describing what differs per entity; the factory returns a named handler that parses the id, resolves the `hardDelete` flag, calls the entity's service, records an audit entry, and responds. This keeps the per-module controller files to a single call rather than duplicating parse/audit/response plumbing.

## Key elements

- **`DeleteControllerSpec`** (interface) — the four per-entity knobs: `entity` (singular lower-case name used for logging and audit `target_type`), `remove(id, hardDelete)` (the service call), `auditAction` (fixed string *or* a function of `hardDelete`), and `notFoundKey` (i18n key for 404).
- **`createDeleteController(spec)`** (function, default export of the module) — returns an Express handler wrapped in `namedHandler` so the handler is visible as `delete<entity>` (e.g. `deleteOrder`) in stack traces and log lines.

## Relationships

- **`@infrastructure/http/controller`** — provides `namedHandler`, `operationName`, `refused`, `rejectValidation`, `catchAsNotFound`, and the `ServiceResult` type used for the service-call contract.
- **`@infrastructure/http/request`** — provides `extractAndValidateId` (pulls `:id` off the route, 422s if malformed), `readInput` (merges `hardDelete` across path/query/body with OR semantics), and `callerContextOf` (extracts caller metadata for the audit record).
- **`@infrastructure/http/response`** — provides `successResponse` for the 200 reply.
- **`@infrastructure/http/schemas`** — provides `hardDeleteSchema`, the Zod schema the merged `hardDelete` value is validated against before the service call.
- **`@infrastructure/observability/audit`** — provides `recordAudit` and the `AuditAction` type; called on successful deletion with the resolved action string, entity name, id, and `{ hardDelete }` in metadata.
- **`src/modules/orders/controllers/delete-orders.ts`**, **`…/delete-products.ts`**, **`…/delete-users.ts`** — consuming module controllers; each is a one-line call to `createDeleteController` with its own spec. `delete-users.ts` is the only consumer that passes `auditAction` as a function (soft vs. hard are distinct audit facts).

## Notes

- The `hardDelete` flag is **OR'd** across all transport surfaces (path segment, query param, body). Any `true` wins regardless of source; all-false/absent defaults to `false`. This avoids the default `false` outvoting a deliberate `true` sent on a different surface.
- `auditAction` is polymorphic: a plain `AuditAction` string, or a `(hardDelete: boolean) => AuditAction` function. The factory checks `typeof` at call time. The `users` module uses the function form because soft delete is reversible and hard delete scrubs the record — the audit trail must distinguish them.
- On a 404 the handler delegates to `catchAsNotFound`, which looks up `notFoundKey` for the i18n message. The handler name passed there is the same `delete<entity>` string used in logs, so trace and response naming stay consistent.
- `remove` returns `ServiceResult<unknown>`; a `refused` result short-circuits before any audit record is written (audit fires only on success).
