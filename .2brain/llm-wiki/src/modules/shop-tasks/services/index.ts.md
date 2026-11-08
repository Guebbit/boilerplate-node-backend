---
source: src/modules/shop-tasks/services/index.ts
sha256: c86867dccbf951548c392c58e6f28d129e7f525ff48f8aa3f59bee7c2d935ae3
generated_at: 2026-11-08T08:16:35.203216+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/services/index.ts

## Purpose

Barrel file for the shop-tasks service layer. It re-exports every event handler and utility function into a single `shopTasksService` object so that `module.ts` (and the module barrel) have one import target instead of reaching into each sibling file individually.

## Key elements

- **`shopTasksService`** (exported const) — the sole public export. A flat object that spreads `shopTasks`, spreads `shopNotices`, and individually attaches `onFulfillmentOrderDelayed`, `runStaffDigest`, and `workSummary`.

## Relationships

- **`module.ts`** — consumes `shopTasksService` to register the event handlers it exposes (the doc comment describes these as "the event handlers `module.ts` subscribes").
- **`src/modules/shop-tasks/index.ts`** — the module-level barrel; this file is its one entry point into the services sub-folder.
- **`services/tasks.ts`** — provides `shopTasks` (open/clear to-dos), spread into the aggregate.
- **`services/notices.ts`** — provides `shopNotices` (messages, staff notices), spread into the aggregate.
- **`services/delayed.ts`** — provides `onFulfillmentOrderDelayed`, the single event shared by both tasks and notices.
- **`services/digest.ts`** — provides `runStaffDigest`, the scheduled summary handler.
- **`services/work-summary.ts`** — provides `workSummary`, used for navigation badge counts.

## Notes

- Two of the five members are spread objects (`shopTasks`, `shopNotices`), so their individual key names become top-level properties on `shopTasksService`. The remaining three are explicit single-function properties. Be aware that a name collision between the two spread objects would silently overwrite.
- The file has no side effects; it is purely a re-export aggregation.
