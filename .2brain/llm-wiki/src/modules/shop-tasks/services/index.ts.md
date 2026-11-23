---
source: src/modules/shop-tasks/services/index.ts
source_sha256: 173f089882868694ae2c99630c0c5551243136ec2eff0ad925e5f21244c2ff3b
context_sha256: d7b581a5b18fdd29151c089c4585bbf1ccabc5998d38c9639f78f9ca801f36de
generated_at: 2026-11-22T07:42:53.317258+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/services/index.ts

## Purpose
Barrel for the shop-tasks service. It gathers the event handlers and scheduled or query functions from the sibling service files into one object, `shopTasksService`, so the rest of the module has a single entry point. `module.ts` subscribes its event handlers through this object.

## Key elements
- `shopTasksService` (the only export): a plain object that merges the following.
  - `...shopTasks` (from `tasks.ts`): opens and clears to-dos.
  - `...shopNotices` (from `notices.ts`): writes messages and staff notices.
  - `onFulfillmentOrderDelayed` (from `delayed.ts`): the one event that both tasks and notices care about.
  - `tellOutcomeUnknown` (from `outcome-unknown.ts`).
  - `runStaffDigest` (from `digest.ts`): the scheduled summary.
  - `workSummary` (from `work-summary.ts`): counts the navigation badges.

## Relationships
- Imports and re-composes `tasks.ts`, `notices.ts`, `delayed.ts`, `outcome-unknown.ts`, `digest.ts` and `work-summary.ts`. It contains no logic of its own.
- `module.ts` is the subscriber of these handlers, per the module doc comment.
- `src/modules/shop-tasks/index.ts` is the module's public barrel. It sits in the same dependency graph as this file, but this file's content doesn't show how it uses the service.

## Notes
- `shopTasks` and `shopNotices` are spread, so their member names become top-level keys. A name that appears in both objects, or that matches one of the explicitly listed members, would be overwritten by the later entry. Keep names unique across these files.
