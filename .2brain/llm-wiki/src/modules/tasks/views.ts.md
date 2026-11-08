---
source: src/modules/tasks/views.ts
sha256: d0d3199b72cffcd1ad8c4f664ee34777cc2c46763c71e196c3fc06d20119a214
generated_at: 2026-11-08T08:42:39.857341+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/views.ts

## Purpose

Projects raw task data into what a reader (the caller) actually sees: resolves assignee usernames in a single batch query and computes the set of available actions based on the caller's standing. The caller is resolved once per page of rows, not once per row, keeping the cost at one ability check and one user lookup per page.

## Key elements

- **`Viewable`** (interface) — Minimal shape of a task that can be projected: `source`, `routeSet`, `status`, and optional `assigneeId`. Accepts both plain-string and object-with-`toString()` assignee identifiers.
- **`assigneeNamesOf`** (function) — Batch-resolves a list of assignee IDs to usernames via `userService.search`. Deduplicates, skips `undefined` entries, and returns a `Map<string, string>`. IDs with no matching account are simply absent from the map.
- **`viewerOf`** (function) — Takes a `Caller` and a pre-resolved name map, returns a factory `{ of(task: Viewable): TaskView }`. Each call to `.of` maps status + permissions (`mayWork`, `mayDelete`) into an `actions` array via `actionsOf` and attaches `assigneeName` when present.

## Relationships

- **`./access`** — Imports `mayDelete` and `mayWork` to gate which actions a caller is permitted on a given task.
- **`./domain`** (via `domain/index.ts`) — Imports `actionsOf` to turn the permission booleans and status into the concrete action list.
- **`./presenter`** — Imports the `TaskView` type, which is the output shape of `viewerOf.of`.
- **`@modules/users`** (via `users/index.ts`) — Calls `userService.search` for the batch username lookup.
- **`@types`** (via `types/index.ts`) — Consumes `Caller`, `TaskStatus`, and `TaskSource` type definitions.

## Notes

- `assigneeId` is typed as `string | { toString(): string }`, accommodating non-string ID objects (e.g. Mongo ObjectIds). Always `String()` it before use.
- `viewerOf` is a closure factory: the caller and name map are captured once, so callers should create it per page rather than per row.
- A missing assignee account is silently omitted (no error, no placeholder); the `assigneeName` key is excluded from the output object entirely via a conditional spread.
- The module is side-effect-free and pure apart from the single async lookup in `assigneeNamesOf`; it holds no state.
