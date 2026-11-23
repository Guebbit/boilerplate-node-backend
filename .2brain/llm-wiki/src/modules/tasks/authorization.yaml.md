---
source: src/modules/tasks/authorization.yaml
source_sha256: 18d9c3a5a6896cb14a256965f6694a5bf7a30e491c23662c674bf8fec2fee0e2
context_sha256: 5722d624fa12066f6138181336b0ffaf357b3da08d6f4f3e6c32a8cca63b3d4c
generated_at: 2026-11-22T07:57:05.069722+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/tasks/authorization.yaml

## Purpose
Declares the authorization rules and permission sets for the `tasks` module. It defines which actions can be performed on the `Task` subject, and bundles those actions into named sets that can be granted to callers.

## Key elements
- **`rules`**: three tenant-scoped rules on subject `Task` (module `tasks`):
  - `read`: read tasks, namely contact messages and the system tasks of a permission set the caller holds.
  - `update`: work a task (resolve, mark as spam, reopen, assign, add a note). A system task also needs the task's own permission set.
  - `delete`: remove a task. A system task also needs the task's own permission set.
- **`sets`**: two named permission sets (module `tasks`):
  - `TaskDisplay`: contains `read:Task`.
  - `TaskManagement`: contains `update:Task` and `delete:Task`.

## Relationships
- Sits beside `src/modules/tasks/openapi.yaml`, the tasks module's API spec. Nothing in this file references it directly, so any link between the two is by convention, not by an explicit reference.

## Notes
- Rule identifiers in sets use the `action:Subject` format (e.g. `read:Task`).
- `TaskManagement` does not include `read`. Per the descriptions, holders would also need `TaskDisplay` to read tasks.
- For system tasks, `update` and `delete` require the task's own permission set in addition to the rule itself. `read` is likewise limited to system tasks of a permission set the caller holds.
- All rules use `scope: tenant`.
