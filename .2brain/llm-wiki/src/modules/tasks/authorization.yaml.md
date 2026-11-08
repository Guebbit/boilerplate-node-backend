---
source: src/modules/tasks/authorization.yaml
sha256: 18d9c3a5a6896cb14a256965f6694a5bf7a30e491c23662c674bf8fec2fee0e2
generated_at: 2026-11-08T08:31:11.147861+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/authorization.yaml

## Purpose

Declares the authorization rules and composable permission sets that govern who can read, update, or delete `Task` resources within the `tasks` module, scoped at the tenant level.

## Key elements

- **`rules`** — Three action rules on the `Task` subject (module: `tasks`, scope: `tenant`):
  - `read` — View tasks (contact messages and system tasks tied to a permission set the caller holds).
  - `update` — Work a task (resolve, mark spam, reopen, assign, add note). System tasks additionally require the task's own permission set.
  - `delete` — Remove a task. System tasks additionally require the task's own permission set.
- **`sets`** — Two named permission sets:
  - `TaskDisplay` — Bundles `read:Task`.
  - `TaskManagement` — Bundles `update:Task` and `delete:Task`.

## Relationships

- **`src/modules/tasks/openapi.yaml`** — The OpenAPI specification for the tasks module. The permission sets defined here (`TaskDisplay`, `TaskManagement`) are the authorization gates applied to the endpoints declared in that spec; a caller must hold the corresponding set to invoke the matching operations.

## Notes

- "System tasks" carry an extra authorization dimension: beyond the caller's own permission set, the task itself defines a required permission set that must also be held. This is an additional check on top of the standard `read`/`update`/`delete` rules.
- `TaskDisplay` is a strict subset of `TaskManagement`; granting `TaskManagement` implicitly covers the read capability only if the application resolves both sets (the YAML itself does not express inheritance).
