---
source: src/infrastructure/surfaces/create-restore-controller.ts
sha256: ad2b7f5990e8c8e9821fbd9b8795d2af48eb15e0c315f77ba9d3a5cd7731400a
generated_at: 2026-09-27T14:17:25.122823+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-restore-controller.ts

## Purpose

Factory that builds a `POST /x/:id/restore` Express handler for any module that soft-deletes via `DELETE /x/:id`. It exists as a separate verb because DELETE must remain safe to repeat (RFC 9110 §9.2.2), so the undo operation needs its own idempotent endpoint.

## Key elements

- **`RestoreControllerSpec<TRow>`** (exported interface) — per-entity configuration: `entity` (singular noun, used in audit/logs), `restore` (service call returning `ServiceResult<TRow>`), `present` (shapes the row into the entity's read projection), `auditAction`, and `notFoundKey` (i18n key for a well-formed-but-unknown id).
- **`createRestoreController`** (exported const) — takes a `RestoreControllerSpec<TRow>` and returns a named Express handler (`restoreOrder`, `restoreProduct`, etc.). Internally it extracts and validates `:id`, delegates to the service, records audit on success, calls `present` to shape the response, and sends a 200 envelope.

## Relationships

- **`@infrastructure/http/controller`** — consumes `namedHandler`, `operationName`, `refused`, `catchAsNotFound`, and the `ServiceResult` type to structure the handler, handle 404/409, and catch unexpected errors.
- **`@infrastructure/http/request`** — calls `extractAndValidateId` for the path parameter and `callerContextOf` for the audit record.
- **`@infrastructure/http/response`** — uses `successResponse` to emit the final 200 body.
- **`@infrastructure/observability/audit`** — calls `recordAudit` with the module's `AuditAction` on successful restore.
- **`src/modules/orders/controllers/restore-orders.ts`**, **`restore-products.ts`**, **`restore-users.ts`** — each supplies an entity-specific `RestoreControllerSpec` and wires the returned handler to its route.

## Notes

- The `present` function is the critical extension point: it must produce the same shape the entity's own `GET /x/:id` returns, so a restore never exposes fields a read would not.
- 409 (record not soft-deleted) and 404 (absent) are signalled by the *service* via `ServiceResult`; this controller only inspects the result through `refused` and `catchAsNotFound`.
- The handler is named `restore<Entity>` (e.g. `restoreOrder`) via `operationName`, which feeds logging and the audit trail.
- Lives under `surfaces/` rather than `http/` because it composes multiple infrastructure pieces into a module-facing unit.
