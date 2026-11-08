---
source: src/modules/tasks/audit.ts
sha256: 959c7cd691f5b1224af5729914537d9ffa50175551db1612df3056a82f30416b
generated_at: 2026-11-08T08:31:05.569944+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/audit.ts

## Purpose
Declares the audit-action vocabulary for the tasks module and registers it into the app-wide `AuditActionMap` type. It exists so that every auditable task operation (admin views, mutations, and system lifecycle events) has a stable, typed string identifier. Reads are explicitly audited here because task rows contain a stranger's email and free text, making "who looked" a data-protection concern rather than a routine catalogue read.

## Key elements
- **`tasksAuditActions`** — `as const` object listing the ten action strings this module owns: eight `admin.task.*` actions (viewed, resolved, marked_spam, reopened, assigned, unassigned, noted, deleted) and two `system.task.*` actions (opened, cleared).
- **Module augmentation of `@infrastructure/observability/audit`** — adds a `tasks` key to the `AuditActionMap` interface so that audit-emission call sites get full autocompletion and type-safety for task-specific actions. Follows the same augmentation pattern as `modules/account/audit.ts`.

## Relationships
- **`src/modules/tasks/service.ts`, `services/system.ts`, `services/workflow.ts`** — consume `tasksAuditActions` to label audit events they emit during task resolution, spam-marking, assignment, and system open/clear flows.
- **`controllers/get-task.ts`** — the admin read path that emits `ADMIN_TASK_VIEWED`; the sole consumer of the "read is audited" action in this vocabulary.
- **`tests/integration/service.test.ts`, `tests/integration/workflow.test.ts`** — assert that the correct `tasksAuditActions` strings appear in audit logs during integration scenarios.

## Notes
- This file exports **no runtime logic** beyond the constant; its other contribution is purely the type-level augmentation. Importing it for side-effect types alone is valid.
- Action strings use dot-namespace / snake_case segments (`admin.task.marked_spam`). Adding a new action requires both a new key here *and* (if it belongs to a different module's namespace) no change here.
- The rationale for auditing reads lives only in the module docblock — there is no runtime guard; it is a policy statement for anyone reviewing why `ADMIN_TASK_VIEWED` exists.
