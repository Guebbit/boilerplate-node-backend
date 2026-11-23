---
source: src/modules/tasks/domain/actions.ts
source_sha256: e2ce56317136ecd3e920629cd52963e80f95c238f58cb8d5c56d63c53e7d270f
context_sha256: 310ae5733b8d063d92abd1f33ed3fcebc70fa01b6a106fa8ef72f0b7535c4b34
generated_at: 2026-11-22T07:59:09.235473+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/tasks/domain/actions.ts

## Purpose
Decides, on the server, which actions a caller may perform on a single task, so clients don't re-implement lifecycle rules. It is pure: the service resolves the caller's permissions once and passes them in as facts.

## Key elements
- `ActionFacts` (interface): input facts, namely the task's `status`, `mayWork` (holds `update:Task`, plus the task's route set for system tasks), `mayDelete` (holds `delete:Task`, same route-set condition), and `assigned`.
- `TaskActionFlags` (interface): the boolean flags sent over the wire as `actions`: `resolve`, `markSpam`, `reopen`, `assign`, `unassign`, `note`, `delete`.
- `actionsOf(facts)`: maps `ActionFacts` to `TaskActionFlags`:
  - `resolve`: `mayWork` and status is not `resolved`
  - `markSpam`: `mayWork` and status is not `spam`
  - `reopen`: `mayWork` and the task is not open
  - `assign`: `mayWork` and the task is open
  - `unassign`: `mayWork` and the task is `assigned`
  - `note`: `mayWork`
  - `delete`: `mayDelete`

## Relationships
- `src/modules/tasks/domain/lifecycle.ts`: imported as `./lifecycle` for `isOpen`, which defines what "open" means for `reopen` and `assign`.
- `src/types/index.ts`: imported as `@types`, provides the `TaskStatus` enum (uses `resolved` and `spam`).
- The graph neighbors `src/modules/tasks/domain/index.ts`, `src/modules/tasks/presenter.ts` and `src/modules/tasks/views.ts` are related to this file, but the file's contents show no direct interaction with them. The `actions` wire flags and "the service" are referenced only in comments.

## Notes
- Each flag requires `mayWork` (or `mayDelete` for `delete`) in addition to a status condition. Status alone never grants an action.
- `reopen` and `assign` are mutually exclusive, since they depend on `isOpen` and its negation.
