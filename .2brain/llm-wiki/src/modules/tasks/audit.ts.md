---
source: src/modules/tasks/audit.ts
source_sha256: d2518f850e79f37409e358f30f5730a4bf83b76f7d10f4a95caab3b3efa0b642
context_sha256: 3cbb736619623f8198a358b4fed481e73ad0b93e2e7dac580525ee1e0db02e93
generated_at: 2026-11-22T07:57:00.570080+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/tasks/audit.ts

## Purpose
Declares the audit action strings the tasks module emits and registers them with the app-wide audit type system. Reads are audited as well as writes, because task rows hold a stranger's email and free text, so who viewed them is a data-protection concern. The file's header comment refers to a "personal-data" section of the tasks module docs.

## Key elements
- `tasksAuditActions`: a `const` object mapping action keys to dotted string values.
  - Staff actions: `ADMIN_TASK_VIEWED`, `ADMIN_TASK_RESOLVED`, `ADMIN_TASK_MARKED_SPAM`, `ADMIN_TASK_REOPENED`, `ADMIN_TASK_ASSIGNED`, `ADMIN_TASK_UNASSIGNED`, `ADMIN_TASK_NOTED`, `ADMIN_TASK_DELETED`. Values use the form `admin.task.<verb>`.
  - System actions: `SYSTEM_TASK_OPENED` (`system.task.opened`) and `SYSTEM_TASK_CLEARED` (`system.task.cleared`).
- Module augmentation of `@infrastructure/observability/audit`: adds a `tasks` entry to `AuditActionMap`. Its type is the union of all `tasksAuditActions` values.

## Relationships
The file itself shows no imports or runtime logic, so the specifics below are inferred from the action names and file locations, not from this file's content.
- `src/modules/tasks/controllers/get-task.ts` likely emits `ADMIN_TASK_VIEWED`.
- `src/modules/tasks/services/remove.ts` likely emits `ADMIN_TASK_DELETED`.
- `src/modules/tasks/services/workflow.ts` likely covers the resolve, spam, reopen, assign, unassign and note actions.
- `src/modules/tasks/services/system.ts` likely covers the `SYSTEM_TASK_OPENED` and `SYSTEM_TASK_CLEARED` events.
- The integration tests (`src/modules/tasks/tests/integration/service.test.ts`, `system-sources.test.ts`, `workflow.test.ts`) likely assert that these actions are recorded.
- `@infrastructure/observability/audit` is the module whose `AuditActionMap` interface this file extends.

## Notes
- Adding an action means adding it to `tasksAuditActions`. The `AuditActionMap` augmentation derives its union from that object, so no second edit is needed.
- The object is declared `as const`, so the action values are literal types.
- The header comment says the augmentation pattern is explained in the account module's audit file.
