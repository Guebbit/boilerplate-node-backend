---
source: src/modules/tasks/services/index.ts
sha256: 43af3032c51ab03ee27929242370b81ea7440f8b4a89ab69f8550c2625ad8e5b
generated_at: 2026-11-14T22:11:04.430805+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/services/index.ts

## Purpose

Barrel module that assembles the task service from one file per use case (`./contact`, `./read`, `./remove`, `./personal-data`, `./workflow`, `./overdue`, `./system`) into a single `taskService` object. It exists so controllers and external modules can import a flat, predictable API surface without reaching into individual sub-files. Domain rules applied by these functions live in `../domain`.

## Key elements

- **`taskService`** (const export) — the sole export of this file; a plain object aggregating:
  - `create`, `mailMainMailbox` — contact-form creation and mailbox routing (`./contact`)
  - `search`, `getById` — staff read queries (`./read`)
  - `removeById` — task deletion (`./remove`)
  - `findOwnTasks`, `findOwnTasksForExport`, `findSystemTasksForExport`, `eraseOwnTasks` — personal-data / GDPR operations (`./personal-data`)
  - `...workflow` — spread of door/state-transition methods (`./workflow`)
  - `remindDueSoon`, `remindOverdue` — reminder sweeps (`./overdue`)
  - `openSystemTask`, `clearSystemTasks` — system-task lifecycle (`./system`)

## Relationships

- **Controllers** (`src/modules/tasks/controllers/*.ts`): every task controller (`delete-task`, `get-task`, `get-tasks`, `get-task-summary`, `post-task`, `post-task-assign`, `post-task-unassign`, `post-task-doors`, `post-task-note`) imports `taskService` from this file as its sole service dependency.
- **Notifications subscribers** (`src/modules/notifications/services/subscribers.ts`): calls `remindDueSoon` / `remindOverdue` to trigger alert delivery; covered by the task-alerts integration tests.
- **Shop-tasks service** (`src/modules/shop-tasks/services/tasks.ts`): shares the same task domain; its erasure integration test exercises `eraseOwnTasks` through this barrel.

## Notes

- This file performs **no logic** of its own — it is purely re-export and object assembly. To change behavior, edit the sub-file (e.g., `./contact.ts`), not this index.
- `...workflow` is spread rather than listed explicitly, so new workflow methods added in `./workflow` are automatically surfaced on `taskService` without updating this file.
- The module doc-block references `docs/modules/tasks.md` for broader module context.
