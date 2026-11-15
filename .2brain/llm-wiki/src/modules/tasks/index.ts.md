---
source: src/modules/tasks/index.ts
sha256: 295eadc15e2798da27d658463d8ae729db0683db29be7934afe154d90f608721
generated_at: 2026-11-14T22:08:05.899933+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/index.ts

## Purpose

Public barrel (module boundary) for the **tasks** module. Per the strategic DDD rule (see `docs/theory/strategic-ddd.md` §5), sibling modules may import tasks functionality *only* through this file. It re-exports the module's public API without adding any logic of its own.

## Key elements

- **`export * from './services'`** — re-exports all runtime values (functions, classes) from the tasks services layer.
- **`export * from './domain'`** — re-exports the domain layer (entities, value objects, domain services).
- **`export * from './emails'`** — re-exports email-related utilities/templates for tasks.
- **`export type * from './model'`** — re-exports **types only** from the model file; no runtime values are pulled in.
- **`export * from './events'`** — re-exports event definitions consumed by the notifications module.

## Relationships

- **`src/modules/tasks/services/index.ts`, `src/modules/tasks/domain/index.ts`, `src/modules/tasks/emails.ts`, `src/modules/tasks/events.ts`, `src/modules/tasks/model.ts`** — direct re-export targets; this barrel is their sole public exposure to other modules.
- **`src/modules/notifications/module.ts` & `src/modules/notifications/services/subscribers.ts`** — sibling modules that consume task events and alert-related exports through this barrel.
- **`src/modules/notifications/tests/integration/task-alerts.test.ts`, `src/modules/notifications/tests/integration/task-due-soon.test.ts`, `src/modules/notifications/tests/integration/task-overdue.test.ts`** — integration tests exercising the task→notification flow, importing task symbols via this barrel.
- **`src/modules/shop-tasks/services/tasks.ts`** — sibling module that pulls task primitives (likely domain types or events) through this barrel.
- **`src/modules/shop-tasks/tests/integration/erasure.test.ts`, `src/modules/shop-tasks/tests/unit/openings.test.ts`** — tests that reference task symbols re-exported here.

## Notes

- `model.ts` is exported with `export type *` while everything else uses `export *`. If a future change adds a runtime value to `model.ts`, it will **not** be visible to consumers unless the export is widened.
- The file is intentionally side-effect-free; it contains no imports, no code, only re-exports. Any logic belongs in the re-exported files.
