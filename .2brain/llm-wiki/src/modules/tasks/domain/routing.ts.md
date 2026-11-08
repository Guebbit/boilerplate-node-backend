---
source: src/modules/tasks/domain/routing.ts
sha256: 70480ed5de8cf0273e2c7e00e614070527ecbf35da97b62522285b46a4e9c043
generated_at: 2026-11-08T08:33:34.417973+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/domain/routing.ts

## Purpose

Defines the jurisdiction mapping between a task and the permission set that reads and routes it. Contact messages are fixed to a single route set; system tasks inherit the set named by their opener (`SystemOpening.routeSet`), so this module holds no enumeration of task kinds — a new kind introduces its own set. Admin requires no special case because it holds every set by construction.

## Key elements

- **`CONTACT_ROUTE_SET`** — `PermissionSetName` constant, fixed to `'TaskDisplay'`. The single permission set that reads and routes a visitor's contact message.
- **`PermissionSetName`** (type import from `@api/permission-vocabulary`) — the shared type for all permission-set identifiers used in this module.

## Relationships

- **`src/modules/tasks/domain/index.ts`** — Barrel file for the `tasks/domain` module; re-exports `CONTACT_ROUTE_SET` (and its type) so consumers can import from the domain entry point rather than this leaf file.

## Notes

- The module deliberately contains no task-kind list. The design invariant is that adding a new task kind means adding its route set *alongside* the kind, not registering it here.
- The string literal `'TaskDisplay'` is the sole value in this file; any rename must stay in sync with the `@api/permission-vocabulary` definition.
