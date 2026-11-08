---
source: src/modules/tasks/events.ts
sha256: b47d024a7264eec32cb35d7b2c217bcc64dc358a2f76a197d122b71ffdeed95c
generated_at: 2026-11-08T08:34:11.183151+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/events.ts

## Purpose

Declares the tasks module's four domain-event payloads by augmenting the kernel's `DomainEventMap` interface (the same pattern used in `modules/orders/events.ts`). All four events are **internal only** — no AsyncAPI channel, no webhook — and serve as the signal that the `notifications` module turns into staff work-notices. A single helper builds the shared payload shape so producers never duplicate it.

## Key elements

- **`declare module '@kernel/events'`** — extends `DomainEventMap` with four payload types: `task.opened`, `task.overdue`, `task.due_soon`, `task.assigned`. The first three share an identical shape; `task.assigned` adds `assigneeId` and `assignedAt`.
- **`taskFactOf(task)`** — builds the payload object for `task.opened` / `task.overdue` / `task.due_soon` from a partial `TaskDocument`. Conditionally includes `category` and `work` (omitted when absent), stamps `tenantId` from `DEPLOYMENT_TENANT_ID`, and stringifies `_id`.
- **`TASK_OPENED`, `TASK_OVERDUE`, `TASK_DUE_SOON`, `TASK_ASSIGNED`** — string constants holding the event names, for use at emit sites without repeating literals.

## Relationships

- **`src/kernel/events.ts`** — source of the `DomainEventMap` interface that this file augments via `declare module`.
- **`src/kernel/access/tenant.ts`** — provides `DEPLOYMENT_TENANT_ID`, used as the `tenantId` in every payload built by `taskFactOf`.
- **`src/modules/tasks/model.ts`** — `TaskDocument` type; `taskFactOf` accepts a `Pick<TaskDocument, '_id'|'kind'|'routeSet'|'category'|'work'>`.
- **`src/modules/tasks/services/overdue.ts`** — producer of `task.overdue` and `task.due_soon` (the "overdue sweep" referenced in the payload docs).
- **`src/modules/tasks/services/system.ts`** — producer of `task.opened`.
- **`src/modules/tasks/services/workflow.ts`** — producer of `task.assigned`.
- **`src/modules/tasks/index.ts`** — module barrel; re-exports the event constants and/or `taskFactOf` for external consumers.
- **Test files** (`due-soon`, `overdue`, `service`, `system-sources`) — integration tests that verify the correct events are emitted with the expected payload shapes.

## Notes

- The three "sweep" events (`opened`, `overdue`, `due_soon`) share one payload shape and one audience (holders of `routeSet`). `task.assigned` is deliberately different: it targets a single `assigneeId` and carries a timestamp so repeated hand-offs are distinguishable.
- `taskFactOf` uses conditional spread (`...(task.category ? { category } : {})`) rather than setting `undefined`, so the persisted outbox document never carries empty optional keys.
- The file is type-level + one function; it contains no runtime logic beyond `taskFactOf`. Event emission lives in the service files listed above.
