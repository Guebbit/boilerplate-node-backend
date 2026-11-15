---
source: src/modules/shop-tasks/services/index.ts
sha256: 173f089882868694ae2c99630c0c5551243136ec2eff0ad925e5f21244c2ff3b
generated_at: 2026-11-14T21:52:31.366822+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/services/index.ts

## Purpose

Barrel aggregation for the shop-tasks service. It collects the event handlers defined across six sibling service files into a single `shopTasksService` object so that `module.ts` (and the module barrel) has one import to subscribe to, rather than importing each handler individually.

## Key elements

- **`shopTasksService`** (const export) — the sole public export. An object assembled by spreading `shopTasks` and `shopNotices`, then adding four standalone functions: `onFulfillmentOrderDelayed`, `tellOutcomeUnknown`, `runStaffDigest`, `workSummary`.

## Relationships

- **`src/modules/shop-tasks/module.ts`** — the consumer; subscribes to the handlers exposed by `shopTasksService`.
- **`src/modules/shop-tasks/index.ts`** — the module-level barrel; re-exports `shopTasksService` outward.
- **`src/modules/shop-tasks/services/tasks.ts`** — provides the `shopTasks` object (open/clear to-dos).
- **`src/modules/shop-tasks/services/notices.ts`** — provides the `shopNotices` object (messages, staff notices).
- **`src/modules/shop-tasks/services/delayed.ts`** — provides `onFulfillmentOrderDelayed`, the shared delayed-order handler.
- **`src/modules/shop-tasks/services/digest.ts`** — provides `runStaffDigest` (scheduled summary).
- **`src/modules/shop-tasks/services/outcome-unknown.ts`** — provides `tellOutcomeUnknown`.
- **`src/modules/shop-tasks/services/work-summary.ts`** — provides `workSummary` (navigation badge counts).

## Notes

- `shopTasks` and `shopNotices` are spread (`...`), so their internal keys become top-level properties of `shopTasksService`. The other four are attached by their own function names. Callers must know which key names come from the spread objects versus the explicit ones.
- The file is declared `@module` with no other named exports; the only way to reach any handler is through `shopTasksService.<key>`.
