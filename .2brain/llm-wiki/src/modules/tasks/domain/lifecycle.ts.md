---
source: src/modules/tasks/domain/lifecycle.ts
sha256: 9ce0d5c5232c5a6ab811c4f169452494d3ff8f678d1129ee57bcf0aab4dac8c9
generated_at: 2026-11-08T08:33:21.868811+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/domain/lifecycle.ts

## Purpose

Pure-function module that encodes every allowed status transition (the "doors") for a task. Each door is a total function from the task's current facts to either a concrete `TaskPatch` (fields to set/unset) or a typed refusal. Keeping transitions here — separate from services, repositories, or HTTP handlers — makes the state machine auditable in one place and trivially testable without I/O.

## Key elements

- **`TaskFacts`** — read-only snapshot of the fields a transition inspects (status, closedAt, respondedAt, assigned, openKey, kind, link).
- **`TaskPatch`** — the write a transition produces: `{ set, unset }`. Consumers (repository, service) apply it; this file never touches a database.
- **`TaskRefusal`** — closed union (`'already_resolved' | 'already_spam' | 'already_open'`) returned when a door is inapplicable.
- **`Transition`** — discriminated union: either `{ patch }` or `{ refusal }`.
- **`resolve(task, now)`** — moves a task to `resolved` with `resolution: 'staff'`. Stamps `closedAt` (preserved if already set) and `respondedAt` (once). Unsets `openKey`.
- **`markSpam(task, now)`** — moves a task to `spam` with `resolution: 'spam'`. Same `closedAt` stamping, no `respondedAt`. Unsets `openKey`.
- **`reopen(task)`** — moves a closed task back to open. Chooses `in_progress` vs `new` based on `assigned`. Unsets `closedAt` and `resolution`; restores `openKey` for linked tasks.
- **`clear(now)`** — system-level auto-close (`resolution: 'cleared'`). Returns a bare `TaskPatch` (no refusal path) because the caller guarantees the task is still open.
- **`isOpen(status)`** / **`OPEN_STATUSES`** — predicate and constant for the two "owes work" statuses.
- **`openKeyOf(kind, link)`** — builds the dedup key string for a linked system task.
- **`initialTaskStatus(suspectedSpam)`** — decides birth status (`new` or `spam`).
- **`DUE_SOON_MS`** — `3 * DAY_MS`; threshold for the "due soon" reminder window (consumed elsewhere, not by any door here).

## Relationships

- **`src/types/index.ts`** — imports `TaskStatus`; every door reads/writes this enum.
- **`src/domain-primitives/time.ts`** — imports `DAY_MS` to compute `DUE_SOON_MS`.
- **`src/modules/tasks/domain/index.ts`** — barrel file that re-exports this module's public surface.
- **`src/modules/tasks/domain/actions.ts`** — sibling domain module; likely composes or dispatches the transitions defined here.
- **`src/modules/tasks/service.ts`** — orchestrator that calls `resolve` / `markSpam` / `reopen` and forwards the resulting `TaskPatch` or surfaces the refusal to the caller.
- **`src/modules/tasks/services/system.ts`** — system automation path; calls `clear(now)` when a linked situation ends.
- **`src/modules/tasks/services/workflow.ts`** — workflow-level service that may invoke these doors as part of a multi-step process.
- **`src/modules/tasks/repository.ts`** — the writer that actually applies a `TaskPatch` to persistence.
- **`src/modules/tasks/presenter.ts`** — presentation layer; may use `isOpen` / `OPEN_STATUSES` to filter or label tasks.
- **`src/modules/tasks/tests/unit/lifecycle.test.ts`** — dedicated unit tests for every door and edge case.
- **`src/modules/tasks/tests/unit/system-openings.test.ts`** — tests the system-open + `clear` interaction.
- **`src/modules/shop-tasks/tests/unit/openings.test.ts`** — cross-module test that exercises these transitions through the shop-tasks domain.

## Notes

- **`dueAt` is intentionally untouched** by every door. The retention/deadline clock belongs to the originating situation, not to the task's open/closed state. Do not add `dueAt` writes to a `TaskPatch` here.
- **`closedAt` is preserved on re-resolve** (e.g., spam → resolved). Only the *first* close stamps it; subsequent closes keep the original value so the retention window is not extended.
- **`respondedAt` is stamped exactly once** (nullish-coalescing pattern). `markSpam` deliberately omits it.
- **`clear` returns a raw `TaskPatch`, not a `Transition`.** The caller is contractually responsible for confirming the task is still open before applying it; there is no refusal branch.
- All functions are **pure and synchronous** — no I/O, no async, no side effects. The `now: Date` parameter is injected for testability.
