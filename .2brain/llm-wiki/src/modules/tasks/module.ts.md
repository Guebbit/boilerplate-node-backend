---
source: src/modules/tasks/module.ts
sha256: 2b572f549d5ca58de2f81d000be130b0f5f466efce68c03c9ffe9c44bbf0a1e8
generated_at: 2026-11-08T08:35:02.619964+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/module.ts

## Purpose

Module manifest for the **tasks** (contact-request) module. It assembles the module's public surface—routes, scheduled jobs, config, rate-limit budgets, personal-data hooks, and domain-event subscriptions—into a single `AppModule` object that the kernel registry consumes at boot.

## Key elements

- **`export default { … } satisfies AppModule`** — The manifest object. Declares `name: 'tasks'`, mounts the router at `/tasks`, and satisfies the kernel's `AppModule` contract.
- **`mounts`** — Registers `router` (from `./routes`) under the `/tasks` base path.
- **`config: [tasksConfig.slice]`** — Exposes the module's typed configuration slice (from `./config`) to the config system.
- **`rateLimits: tasksRateLimits`** — Applies the contact-form submission budgets defined in `./rate-limits.ts`.
- **`jobs: tasksJobs`** — Wires the module's scheduled/recurring jobs (from `./jobs`).
- **`personalData`** — Two GDPR-style sections:
  - `tasks` — `collect` returns the subject's own tasks for export; `erase` hard-deletes them inside a transaction (delegated to `taskService.eraseOwnTasks`).
  - `systemTasks` — `collect` returns system-opened tasks (staff IDs redacted) for export; erasure is handled by the first section's hook.
- **`subscribe()`** — Subscribes four cross-module domain events to `systemTasks` handlers (see Relationships).
- **`locales` / `templates`** — Points the i18n and template engines at the `locales/` and `templates/` directories adjacent to this file.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` type that the default export must satisfy.
- **`src/kernel/events.ts`** — Provides `onDomainEvent`, used inside `subscribe()` to bind event handlers.
- **`src/modules/users/index.ts`** — Source of `USER_REVIEW_FLAGGED` and `USER_REVIEW_CLEARED` events; each triggers a `systemTasks` handler to open or close a system task.
- **`src/modules/account/index.ts`** — Source of `ACCOUNT_EXPORT_FAILED` and `ACCOUNT_EXPORT_READY` events; same subscription pattern.
- **`src/modules/tasks/routes.ts`** — Imported as `router` and mounted at `/tasks`.
- **`src/modules/tasks/jobs.ts`** — Imported as `tasksJobs` and registered in the manifest.
- **`src/modules/tasks/rate-limits.ts`** — Imported as `tasksRateLimits`; defines the contact-form budgets.
- **`src/modules/tasks/config.ts`** — Imported as `tasksConfig`; its `.slice` is exposed for runtime configuration.
- **`src/modules/tasks/service.ts`** — Imported as `taskService`; provides `findOwnTasksForExport`, `eraseOwnTasks`, and `findSystemTasksForExport` used by the `personalData` hooks.
- **`src/modules/tasks/services/system.ts`** — Imported as `systemTasks`; holds the four event handlers wired in `subscribe()`.

## Notes

- `personalData` sections are ordered: `systemTasks` erasure is **not** an independent hook—it is deliberately left to the `tasks` section's `erase`, which owns the whole collection (including system tasks) in a single transaction.
- `erase` runs only inside the hard-delete transaction, never at the reversible-lock step (per the inline comment).
- The `satisfies AppModule` keyword is used rather than an explicit type annotation, so the object retains its inferred literal types while still being checked against the interface.
- `module.yaml` and `openapi.yaml` sit alongside this file but are **not** imported here; they are consumed by the framework/tooling at a different layer.
