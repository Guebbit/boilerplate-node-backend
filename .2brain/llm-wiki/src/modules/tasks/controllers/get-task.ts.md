---
source: src/modules/tasks/controllers/get-task.ts
source_sha256: 8fb0ba2eb2a7187a9dc6fa899267a1a979e4dd6e6fedd2e30f466b87f83680fd
context_sha256: 6bda2d650164804a4fb74d6d4ea40b00c82adebc4b44760318e42a5a79618509
generated_at: 2026-11-22T07:57:47.448538+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/tasks/controllers/get-task.ts

## Purpose
Express controller for `GET /tasks/:id` (staff). It returns a single task from the staff queue within the caller's jurisdiction. When the task came from a visitor, the read is audited because it identifies a person.

## Key elements
- `getTaskById(request, response)`: the only export. It:
  1. Validates the `:id` param with `requireId`, which answers 404 with `generic.error-item-gone` on failure. It then returns a resolved promise.
  2. Loads the task through the tasks service, passing the id and `callerContextOf(request)`.
  3. Stops if `refused(response, result)` has already written a refusal.
  4. If the task's `source` is `TaskSource.visitor`, calls `recordStaffRead` with key `read:Task`, the `ADMIN_TASK_VIEWED` audit action, `targetType: 'task'`, `targetId: id` and the task's `subjectId`.
  5. Sends the task data with `successResponse(response, ..., 200)`.
  6. Maps unexpected errors through `catchAs(response, 'getTaskById')`.

## Relationships
- `src/infrastructure/http/ids.ts`: `requireId` parses and validates the route id.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context, which is passed to the service.
- `src/infrastructure/http/response.ts`: `successResponse` writes the 200 body.
- `src/infrastructure/http/controller.ts`: `refused` handles service-level refusals, and `catchAs` is the error handler.
- `src/modules/tasks/services/index.ts`: exports `taskService`, which loads the task.
- `src/modules/tasks/audit.ts`: exports `tasksAuditActions`, the source of the `ADMIN_TASK_VIEWED` action.
- `src/kernel/staff-read.ts`: `recordStaffRead` writes the audit record.
- `src/types/index.ts`: supplies the `TaskSource` enum.
- `src/modules/tasks/routes.ts`: the route table that wires this handler to `GET /tasks/:id`.

## Notes
- A malformed, unknown or out-of-jurisdiction id all answer 404, so the response does not reveal whether a task exists elsewhere.
- Only visitor-sourced tasks are audited. Tasks from other sources are returned without an audit record.
- The audit is recorded after the refusal check, so refused reads are not logged. It is recorded before the response is sent.
