---
source: src/modules/tasks/asyncapi.domain-events.yaml
generated_at: 2026-11-22T07:56:48.705304+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/tasks/asyncapi.domain-events.yaml

## Purpose
AsyncAPI fragment (not a standalone document) declaring the domain events the tasks module emits. It is merged into the `domain-events` section of `shared/contracts/asyncapi.domain-events.yaml` and is backend-only. All events travel over the `outbox` transport and carry only closed codes and ids, never visitor text, because the outbox persists what rides the bus.

## Key elements
- **Channels** (all `x-transport: outbox`, each with a single message):
  - `domain.task.opened` (address `task.opened`): a task was inserted, not a repeat of an open one and not spam.
  - `domain.task.overdue` (`task.overdue`): an open task passed its due date and was claimed by the overdue sweep; emitted once per task.
  - `domain.task.due_soon` (`task.due_soon`): an open task is within three days of its due date and was claimed by the same sweep; emitted once per task.
  - `domain.task.assigned` (`task.assigned`): someone gave a task to a colleague. Taking your own task does not emit it.
- **Operations**: `domainTaskOpened`, `domainTaskOverdue`, `domainTaskDueSoon`, `domainTaskAssigned`, all `action: send`, each pointing to its channel and message.
- **Messages**: `TaskOpenedDomainEvent`, `TaskOverdueDomainEvent`, `TaskDueSoonDomainEvent`, `TaskAssignedDomainEvent`, each referencing a payload schema (the message name followed by `Payload`, e.g. `TaskOpenedDomainEventPayload`).
- **Payload schemas** (all `additionalProperties: false`):
  - Opened, overdue and due-soon share one shape. Required fields are `tenantId`, `taskId`, `kind` and `routeSet`. `routeSet` is the permission set that works the task, and its holders are who hear of it. Optional fields are `category` (a contact task's category) and `work` (the staff screen that does the work).
  - Assigned requires `tenantId`, `taskId`, `kind`, `routeSet`, `assigneeId` and `assignedAt`. `assigneeId` is the only person told. `assignedAt` is an ISO instant string.

## Relationships
- Sibling fragment of `src/modules/products/asyncapi.domain-events.yaml`, which follows the same pattern for the products module. Both merge into the shared `domain-events` contract.

## Notes
- The overdue and due-soon events come from the same sweep, which "claims" tasks so each is announced only once.
- `assigned` is the exception to the once-per-task rule: a task handed back and forth emits a new event each time, which is why `assignedAt` is included.
- `assigned` has no `category` or `work` fields.
- The three sweep and open payload schemas are duplicated verbatim rather than shared through a common `$ref`. Keep them in sync when editing.
