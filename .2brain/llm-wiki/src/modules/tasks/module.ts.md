---
source: src/modules/tasks/module.ts
sha256: d0aeb5fe0024755054b203019ea2b2ef2af3be247e37e4211922b46a07a2a59b
generated_at: 2026-11-14T22:09:04.824671+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/module.ts

## Purpose

Entry-point manifest for the **tasks** module (public contact requests + system tasks). It wires the router, scheduled jobs, config, rate limits, personal-data export/erasure hooks, and cross-module domain-event subscriptions into a single `AppModule` object that the kernel registry can discover and mount.

## Key elements

- **`default export`** — the `AppModule` literal (name `tasks`). Satisfies the `AppModule` type from `@kernel/registry`.
- **`mounts`** — mounts the imported `router` at base path `/tasks`.
- **`config`** — exposes `tasksConfig.slice` for the module's runtime configuration.
- **`rateLimits`** — contact-form budgets defined in `./rate-limits.ts`.
- **`jobs`** — scheduled/background jobs from `./jobs.ts`.
- **`personalData`** — two export/erasure sections:
  - `tasks` — `collect` calls `taskService.findOwnTasksForExport`; `erase` calls `taskService.eraseOwnTasks` (runs only inside the hard-delete transaction).
  - `systemTasks` — `collect` calls `taskService.findSystemTasksForExport`; no `erase` (handled by the `tasks` section's erase, which owns the whole collection).
- **`subscribe()`** — registers four `onDomainEvent` handlers that delegate to the `systemTasks` object from `./services/system.ts`.
- **`locales` / `templates`** — filesystem paths (relative to `__dirname`) for i18n strings and view templates.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that the default export satisfies.
- **`src/kernel/events.ts`** — provides `onDomainEvent`, used in `subscribe()` to listen to cross-module events.
- **`src/modules/account/index.ts`** — source of the `ACCOUNT_EXPORT_FAILED` and `ACCOUNT_EXPORT_READY` events subscribed to in `subscribe()`.
- **`src/modules/users/index.ts`** — source of the `USER_REVIEW_FLAGGED` and `USER_REVIEW_CLEARED` events subscribed to in `subscribe()`.
- **`src/modules/tasks/services/system.ts`** — provides the `systemTasks` object whose handler methods are wired to the four domain events in `subscribe()`.
- **`src/modules/tasks/routes.ts`** — supplies the HTTP router mounted at `/tasks`.
- **`src/modules/tasks/services/index.ts`** — supplies `taskService`, used by both `personalData` hooks.
- **`src/modules/tasks/jobs.ts`**, **`rate-limits.ts`**, **`config.ts`** — imported and re-exposed in the manifest.
- **`src/modules/tasks/tests/integration/export.test.ts`** / **`ownership.test.ts`** — integration tests exercising the `personalData` collect/erase hooks defined here.

## Notes

- `personalData.tasks.erase` receives a `session` argument and is explicitly scoped to the **hard-delete transaction**; it must not run at the reversible-lock stage.
- The `systemTasks` section intentionally omits `erase` because the `tasks` section's erase hook owns the full collection — duplicating it would cause double-deletion.
- `collect` must always return an array even when the set is empty (contract requirement).
- The module *announces* `task.opened` / `task.assigned` domain events but does **not** send user-facing notifications itself; the `notifications` module handles that.
