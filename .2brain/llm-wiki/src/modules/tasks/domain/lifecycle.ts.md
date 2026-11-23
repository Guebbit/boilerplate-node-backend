---
source: src/modules/tasks/domain/lifecycle.ts
source_sha256: a0c446b4ee583dca29bbe28cf60a614893a0f002ce1f68625a6206ce1964957b
context_sha256: ac2d3617b68510e3d37afd7d7b43e5ed1a637855d9ff5a5a6fa23250158be3e8
generated_at: 2026-11-22T07:59:39.578490+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/tasks/domain/lifecycle.ts

## Purpose
Defines a task's lifecycle as pure functions. `status` is read-only on the wire and changes only through three "doors" (`resolve`, `markSpam`, `reopen`) and through assignment (`new` <-> `in_progress`). Each door takes the task's facts and returns either the write it owes (a set/unset patch) or a refusal. Open = `new | in_progress`; closed = `resolved | spam`.

## Key elements
- `TaskFacts` — the inputs a transition reads: `status`, `closedAt`, `respondedAt`, `assigned`, `openKey`, `kind`, optional `link`.
- `TaskPatch` — `{ set, unset }`: fields to set and field names to unset.
- `TaskRefusal` / `Transition` — refusal reasons (`already_resolved`, `already_spam`, `already_open`) and the door result, either `{ patch }` or `{ refusal }`.
- `DUE_SOON_MS` — `3 * DAY_MS`: how far ahead of a deadline the single "due soon" reminder goes out, and the shortest task life that earns one.
- `OPEN_STATUSES` / `isOpen(status)` — the statuses that still owe work.
- `openKeyOf(kind, link)` — dedup key `kind:type:id`, one open system task per kind and record. Visitor messages have none.
- `initialTaskStatus(suspectedSpam)` — `spam` if suspected, otherwise `new`.
- `resolve(task, now)` — refuses if already resolved. Otherwise sets `status: resolved`, `resolution: 'staff'`, `closedAt` (kept if already set), and `respondedAt` (stamped once), and unsets `openKey`.
- `markSpam(task, now)` — refuses if already spam. Sets `status: spam`, `resolution: 'spam'`, and `closedAt` (kept if already set). Does not touch `respondedAt`. Unsets `openKey`.
- `reopen(task)` — refuses if already open. Sets status to `in_progress` if `assigned`, else `new`. Restores `openKey` for linked tasks. Unsets `closedAt` and `resolution`.
- `clear(now)` — the system closes a task: `resolved` with `resolution: 'cleared'`, `closedAt: now`, and unsets `openKey`. Returns a bare `TaskPatch`, not a `Transition`.

## Relationships
- Imports `TaskStatus` from `src/types/index.ts` and `DAY_MS` from `src/domain-primitives/time.ts`.
- Sits in the tasks domain next to `src/modules/tasks/domain/actions.ts` and is exposed via `src/modules/tasks/domain/index.ts`.
- Pinned by `src/modules/tasks/tests/unit/lifecycle.test.ts`, with `src/modules/tasks/tests/unit/system-openings.test.ts` and `src/modules/shop-tasks/tests/unit/openings.test.ts` among the related tests.
- Other neighbors (`src/modules/tasks/repository.ts`, `src/modules/tasks/presenter.ts`, and the `contact`, `read`, `system` and `workflow` services under `src/modules/tasks/services/`) are linked to it in the dependency graph. The file itself only exports the pure helpers, and what each consumer does with them is not visible here.

## Notes
- `dueAt` is deliberately not touched by any door: the clock belongs to the situation, not to the reopen (for example, an FTC deadline does not restart when staff reopen a task).
- `closedAt` is the retention clock. Closing stamps it, and reopening unsets it, which stops the clock.
- `resolve` keeps an existing `closedAt` when going from spam to resolved. `markSpam` does the same when going from resolved to spam.
- `clear` has no guard. Per its doc comment, the caller must apply it only to tasks that are still open, so a task staff closed first is never overwritten. Notes are kept.
- The functions return patches and never write anything. Applying them is the caller's job.
- The module header points to the lifecycle section of the tasks module documentation for the full description.
