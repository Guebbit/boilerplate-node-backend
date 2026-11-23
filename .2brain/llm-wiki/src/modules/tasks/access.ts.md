---
source: src/modules/tasks/access.ts
source_sha256: f3d54c37f1c3cb69bbfabe9c5634b24751160ffcce9f19e2562d56a770c72db1
context_sha256: c85946c103ed754318baae34e5a8a95149d83b297861c7f68be708ae4a3cdea8
generated_at: 2026-11-22T07:56:34.529862+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/tasks/access.ts

## Purpose
Decides who may see and work which task. Visitor tasks (inbox messages) are open to anyone who passes the route's `Task` rule. System tasks belong to a jurisdiction: only a caller holding the task's route set (administrators hold all) may see or work them. The file narrows which rows are visible so that route guards and queries stay consistent.

## Key elements
- `Jurisdiction` — interface with the two facts that decide access: `source: TaskSource` and `routeSet: string`.
- `heldRouteSets(caller)` — names of all `PERMISSION_SETS` the caller holds (via `holdsSet`). A task is visible iff its frozen route set is among them.
- `jurisdictionScope(caller)` — Mongo filter limiting reads to the caller's jurisdiction: all visitor tasks, plus system tasks whose `routeSet` is in `heldRouteSets`. Returns `{}` when `caller.unrestricted`.
- `inJurisdiction(caller, task)` — true for visitor tasks, otherwise requires `holdsSet(caller, task.routeSet)`.
- `mayWork(caller, task)` — `update:Task` ability and in jurisdiction (resolve, assign, note…).
- `mayDelete(caller, task)` — `delete:Task` ability and in jurisdiction.
- `roleMayWorkRouteSet(roleName, routeSet)` — whether a person with a tenant role can be assigned a task of that route set. Returns `false` for a null role and `true` for an unrestricted role. Otherwise the role's expanded permissions must include `update:Task` and every rule of the named set.

## Relationships
- `src/kernel/ability.ts`: supplies `holds` (single ability check) and `holdsSet` (route-set check) for caller-based decisions.
- `src/kernel/permissions.ts`: supplies `PERMISSION_SETS`, `permissionsOfRole` and `isUnrestrictedRole`, used to enumerate sets and to expand a role's rules.
- `src/types/auth-context.ts` and `src/types/index.ts` (imported as `@types`): provide `Caller` and `TaskSource`.
- `src/modules/tasks/services/read.ts`, `src/modules/tasks/services/remove.ts`, `src/modules/tasks/services/workflow.ts` and `src/modules/tasks/views.ts` are graph neighbors. Their use of these helpers is not shown in this file. The module doc states that route guards and queries share these rules.
- `src/modules/tasks/tests/unit/routing.test.ts` is a related test neighbor.

## Notes
- `jurisdictionScope` (query side) and `inJurisdiction` (single-task side) express the same rule in two forms and should be kept in sync.
- `roleMayWorkRouteSet` works from role data rather than a `Caller`. It requires `update:Task` so a read-only person is not handed work they cannot do.
- For an unknown `routeSet`, `set?.rules.every(...)` is `undefined`, so `roleMayWorkRouteSet` returns `false` for a non-unrestricted role.
