---
source: src/modules/tasks/index.ts
sha256: 98ac61d185835b3709b66554c391768e4884daa4ace9d58efe75140ee418ce02
generated_at: 2026-11-08T08:34:20.113855+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/index.ts

## Purpose

Barrel (public API) for the Tasks module. It is the **only** import surface that sibling modules (e.g. `notifications`, `shop-tasks`) are allowed to use, enforcing the strategic-Ddd boundary rule described in `docs/theory/strategic-ddd.md` §5. It contains no logic of its own—only re-exports.

## Key elements

- `export * from './service'` — re-exports the task service (runtime functions/classes).
- `export * from './domain'` — re-exports the domain layer (entities, value objects, repository interfaces, etc.).
- `export * from './emails'` — re-exports email/notification templates or builders related to tasks.
- `export type * from './model'` — re-exports **types only** from the model layer; no runtime values leak through this path.
- `export * from './events'` — re-exports domain event definitions (likely `TaskCreated`, `TaskCompleted`, etc.).

## Relationships

- **`src/modules/tasks/service.ts`, `domain/index.ts`, `emails.ts`, `model.ts`, `events.ts`** — direct re-export sources; this barrel is their sole external entry point.
- **`src/modules/notifications/module.ts`** and **`src/modules/notifications/services/subscribers.ts`** — downstream consumers that import task events/subscribers through this barrel.
- **`src/modules/shop-tasks/services/tasks.ts`** — downstream consumer importing the task service/domain through this barrel.
- **Integration tests** in both `notifications` and `shop-tasks` (`task-alerts`, `task-due-soon`, `task-overdue`, `erasure`, `openings`) exercise cross-module behavior via imports that resolve through this barrel.

## Notes

- `model` is exported with `export type *`, so importing a runtime value from `tasks` that only exists in `model.ts` will fail at build time. Consumers must get runtime values from `service` or `domain` instead.
- Adding a new sub-module (e.g. `src/modules/tasks/scheduled.ts`) requires a matching `export *` line here to make it visible to siblings; otherwise it is unreachable outside the module.
