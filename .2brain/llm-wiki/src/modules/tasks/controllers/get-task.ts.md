---
source: src/modules/tasks/controllers/get-task.ts
sha256: 7fdb6a628cf0adfb77126e4db19d736935aa9d860ba7aed2affba82d08651228
generated_at: 2026-11-08T08:31:54.792523+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/controllers/get-task.ts

## Purpose

HTTP handler for `GET /tasks/:id` (staff endpoint). Retrieves a single task from the staff queue scoped to the caller's jurisdiction and, when the task belongs to a visitor, records an audit entry naming the person the task references.

## Key elements

- **`getTaskById`** (exported) – Express handler for the staff "get one task" route. Validates the `:id` param, delegates to `taskService.getById`, conditionally writes an audit record, and responds 200 or an error.

## Relationships

- **`src/modules/tasks/service.ts`** – calls `taskService.getById(id, callerContext)` to fetch and scope the task.
- **`src/infrastructure/http/ids.ts`** – uses `requireId` to parse/validate the route param; short-circuits with 404 if absent or malformed.
- **`src/infrastructure/http/controller.ts`** – uses `refused` to short-circuit on a refusal result and `catchAs` for uniform error responses.
- **`src/infrastructure/http/request.ts`** – calls `callerContextOf(request)` to derive the caller's jurisdiction for the service lookup.
- **`src/infrastructure/http/response.ts`** – sends the 200 payload via `successResponse`.
- **`src/kernel/staff-read.ts`** – calls `recordStaffRead` to persist the audit event when the task's source is `visitor`.
- **`src/modules/tasks/audit.ts`** – supplies the `tasksAuditActions.ADMIN_TASK_VIEWED` action token for the audit record.
- **`src/types/index.ts`** – imports the `TaskSource` discriminator used to check whether the audit branch fires.
- **`src/modules/tasks/routes.ts`** – registers `getTaskById` as the handler for the `GET /tasks/:id` staff route.

## Notes

- All failure modes (missing/malformed id, unknown id, out-of-jurisdiction) deliberately return the **same 404** with a generic message (`generic.error-item-gone`) to avoid leaking which case occurred.
- The audit log fires **only** for `TaskSource.visitor` tasks; staff-sourced tasks are read silently.
- The audit entry's `ownerId` field carries the task's `subjectId` (the person named by the task), not the requesting staff member.
- On id-validation failure the handler returns `Promise.resolve()` (a void promise) rather than `undefined`, keeping the Express handler's async contract consistent.
