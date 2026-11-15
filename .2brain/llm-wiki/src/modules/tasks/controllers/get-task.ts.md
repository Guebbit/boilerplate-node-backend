---
source: src/modules/tasks/controllers/get-task.ts
sha256: 550a98ea362b5c8cb04e90079509db4247e093718202330369ecd33fe1929179
generated_at: 2026-11-14T22:06:09.552397+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/controllers/get-task.ts

## Purpose

Controller for the `GET /tasks/:id` staff endpoint. Resolves a single task from the staff queue scoped to the caller's jurisdiction and, when the task originates from a visitor, records a named staff-read audit event before returning the task.

## Key elements

- **`getTaskById(request, response)`** — The sole export. Validates the route `id` param via `requireId`, delegates to `taskService.getById(id, callerContextOf(request))`, and on success sends a 200 with the task data. All failure paths (malformed id, unknown id, out-of-jurisdiction) surface as a 404 (`generic.error-item-gone`).

## Relationships

- **`src/modules/tasks/routes.ts`** — Mounts `getTaskById` as the handler for the `GET /tasks/:id` staff route.
- **`src/modules/tasks/services/index.ts`** — Exports `taskService`, whose `getById` method performs the actual lookup and jurisdiction check.
- **`src/kernel/staff-read.ts`** — `recordStaffRead` is called (only for visitor-sourced tasks) to write the audit event.
- **`src/modules/tasks/audit.ts`** — Exports `tasksAuditActions`, the action-key enum used when writing the staff-read record.
- **`src/infrastructure/http/controller.ts`** — Provides `refused` (short-circuits on service-level denial) and `catchAs` (maps thrown errors to an HTTP error response tagged with the controller name).
- **`src/infrastructure/http/ids.ts`** — `requireId` validates/extracts the `:id` param and writes the 404 response if invalid.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` derives the caller's auth/jurisdiction context from the request, passed into the service call.
- **`src/infrastructure/http/response.ts`** — `successResponse` serialises the 200 reply.
- **`src/types/index.ts`** — Exports the `TaskSource` enum; the controller checks the task's `source` field against it to decide whether the audit side-effect fires.

## Notes

- The audit side-effect is **conditional**: it only fires when the task's `source` field matches the visitor value of `TaskSource`. Staff-created tasks do not trigger a staff-read event.
- The audit record includes `subjectId` (the person named by the task), making the read attributable to a specific individual — this is why the module docstring calls it out.
- There is no 403 path in this controller; jurisdiction denial is handled upstream by the service and surfaced as a generic 404 to avoid leaking existence.
- `callerContextOf(request)` is the mechanism that carries jurisdiction into the service layer; the controller itself performs no scoping logic.
