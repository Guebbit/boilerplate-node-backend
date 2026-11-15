---
source: src/modules/tasks/domain/actions.ts
sha256: e2ce56317136ecd3e920629cd52963e80f95c238f58cb8d5c56d63c53e7d270f
generated_at: 2026-11-14T22:07:49.078602+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/domain/actions.ts

## Purpose

Pure, server-side logic that maps a caller's standing (permissions) and a task's current status to the set of actions they are allowed to perform on that task. It centralises the decision so no client re-implements the lifecycle rules.

## Key elements

- **`ActionFacts`** (interface) — Input shape: `status`, `mayWork`, `mayDelete`, `assigned`. Represents the resolved standing the caller holds for one task.
- **`TaskActionFlags`** (interface) — Output shape: seven boolean flags (`resolve`, `markSpam`, `reopen`, `assign`, `unassign`, `note`, `delete`). Described in a comment as "the flags the wire carries as `actions`."
- **`actionsOf`** (function) — Accepts an `ActionFacts` object and returns a `TaskActionFlags` object. Each flag requires `mayWork` (or `mayDelete` for `delete`) **and** a status precondition (e.g. `reopen` requires the task to *not* be open; `assign` requires it *to be* open).

## Relationships

- **`src/modules/tasks/domain/lifecycle.ts`** — Imports `isOpen(status)` to gate the `reopen` and `assign` flags.
- **`src/types/index.ts`** — Imports `TaskStatus` enum for status comparisons.
- **`src/modules/tasks/domain/index.ts`** — Barrel file; expected to re-export `ActionFacts`, `TaskActionFlags`, and `actionsOf` for downstream consumption.
- **`src/modules/tasks/presenter.ts` / `src/modules/tasks/views.ts`** — Downstream consumers that receive the resolved `TaskActionFlags` (likely via the wire) to decide which UI actions to expose.

## Notes

- `mayWork` and `mayDelete` are described as carrying "the task's route set when it is a system task," implying route-level access checks are resolved *before* this function runs. This file never inspects routes itself.
- The function is intentionally side-effect-free and dependency-free (beyond the two imports) so it is trivially testable and safe to call at any layer.
- `delete` is the only flag gated by `mayDelete` rather than `mayWork`, reflecting a separate permission.
