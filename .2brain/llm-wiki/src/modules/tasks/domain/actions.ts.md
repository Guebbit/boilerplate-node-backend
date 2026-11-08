---
source: src/modules/tasks/domain/actions.ts
sha256: 6d814b16928dae64448acf5d9ea16ad69ac589faa2c04d0a2066e2f56c9d0abd
generated_at: 2026-11-08T08:32:56.134985+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/domain/actions.ts

## Purpose

Pure, server-side mapping from a caller's standing on one task to the set of actions that are available. By computing flags in one place, no client re-implements the lifecycle rules. The function is synchronous and side-effect-free: the service resolves permissions upstream and hands the facts in.

## Key elements

- **`ActionFacts`** (interface) – Input shape: `status`, `mayWork`, `mayDelete`, `assigned`. `mayWork` encodes both the `update:Task` permission and the system-task route check; `mayDelete` does the same for `delete:Task`.
- **`TaskActionFlags`** (interface) – Output shape carried on the wire as `actions`: `resolve`, `markSpam`, `reopen`, `assign`, `unassign`, `note`, `delete`.
- **`actionsOf`** (const, pure function) – Accepts `ActionFacts`, returns `TaskActionFlags`. Each flag is the conjunction of the relevant standing flag and a status precondition (e.g. `resolve` requires `mayWork` and status ≠ resolved; `reopen` requires `mayWork` and the task is *not* open).

## Relationships

- **`src/types/index.ts`** – Imports the `TaskStatus` enum used in status comparisons.
- **`src/modules/tasks/domain/lifecycle.ts`** – Imports `isOpen` to gate `reopen`, `assign`, and `unassign`.
- **`src/modules/tasks/domain/index.ts`** – Barrel module that re-exports this file's public API to the rest of the domain.
- **`src/modules/tasks/presenter.ts`** – Consumes `TaskActionFlags` to decide which action commands to expose.
- **`src/modules/tasks/views.ts`** – Renders the concrete action buttons/controls driven by those flags.

## Notes

- `delete` is the only flag keyed to `mayDelete`; every other flag keys to `mayWork`. A caller who can delete a task may not be able to work it (or vice-versa).
- `note` is the only flag with no status precondition beyond `mayWork` — it is always available when the caller has standing.
- The file is intentionally free of I/O, async, and configuration; all policy is expressed in the boolean logic of `actionsOf`. Adding a new action means adding a flag to `TaskActionFlags` and one line of predicate here.
