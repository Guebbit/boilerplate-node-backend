---
source: src/modules/tasks/domain/routing.ts
source_sha256: 70480ed5de8cf0273e2c7e00e614070527ecbf35da97b62522285b46a4e9c043
context_sha256: dba2b8b39675aa4cc55859470eb3a9c526a2d7221d017892fb3b30053d8e90f3
generated_at: 2026-11-22T07:59:48.914641+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/tasks/domain/routing.ts

## Purpose
Defines jurisdiction for tasks: which permission set works (reads and routes) a given task. Contact messages always use one fixed set. System tasks use the set named by their opener (`SystemOpening.routeSet`), so this file keeps no list of task kinds. A module that adds a kind supplies its own set. Admin holds every set by construction, so no admin special case is needed.

## Key elements
- `CONTACT_ROUTE_SET`: constant of type `PermissionSetName`, set to `'TaskDisplay'`. It is the permission set that reads and routes a visitor's contact message.

## Relationships
- Imports the `PermissionSetName` type from `@api/permission-vocabulary` (type-only import).
- Sits alongside `src/modules/tasks/domain/index.ts`, which is its graph neighbor in the tasks domain.

## Notes
- Routing for system tasks is not decided here. It comes from `SystemOpening.routeSet`, which is defined elsewhere.
- Adding a new task kind needs no change to this file.
