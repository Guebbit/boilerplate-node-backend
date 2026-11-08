---
source: src/modules/tasks/access.ts
sha256: 8a08b900a8a14056f4708a83c866bea757d09e08856914653277134ab32cb173
generated_at: 2026-11-08T08:30:54.155176+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/access.ts

## Purpose
Defines the access-control rules for tasks: which rows a caller may see and which actions they may perform on them. The two governing facts are the task's `source` (visitor vs. system) and its `routeSet`. Visitor tasks are open to anyone past the route guard; system tasks are scoped to callers holding the matching route set. This file centralises the "which rows" decision so that route guards and data queries cannot diverge.

## Key elements
- **`Jurisdiction`** (interface) — the two fields that determine access: `source` and `routeSet`.
- **`heldRouteSets(caller)`** — returns the names of every `PERMISSION_SET` the caller satisfies; used to build a Mongo `$in` filter without hard-coding set names.
- **`jurisdictionScope(caller)`** — returns a Mongo query fragment (`$or` on `source` + `routeSet`) that limits a read to the caller's jurisdiction. Returns `{}` (no filter) for unrestricted callers.
- **`inJurisdiction(caller, task)`** — pure boolean check: visitor tasks pass unconditionally; system tasks require `holdsSet` on the task's `routeSet`.
- **`mayWork(caller, task)`** — `holds(caller, 'update', 'Task')` **and** `inJurisdiction`. Gate for resolve, assign, note, etc.
- **`mayDelete(caller, task)`** — `holds(caller, 'delete', 'Task')` **and** `inJurisdiction`.
- **`roleMayWorkRouteSet(roleName, routeSet)`** — static, role-level check (no live `Caller`): a role may be *assigned* a task of `routeSet` only if it expands to `update:Task` **and** every rule in that set. Returns `true` immediately for unrestricted roles; `false` for `null` roles.

## Relationships
- **`src/kernel/ability.ts`** — provides `holds` and `holdsSet`, the primitives every check in this file delegates to.
- **`src/kernel/permissions.ts`** — provides `PERMISSION_SETS`, `permissionsOfRole`, and `isUnrestrictedRole`; the source of truth for set membership and role expansion.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — supply the `Caller` and `TaskSource` types consumed throughout this module.
- **`src/modules/tasks/views.ts`** — consumes `jurisdictionScope` to build the read query so that list/detail views return only in-jurisdiction rows.
- **`src/modules/tasks/service.ts`** — likely calls `mayWork` / `mayDelete` before mutating a task.
- **`src/modules/tasks/services/workflow.ts`** — likely calls `mayWork` as a precondition for state transitions.
- **`src/modules/tasks/tests/unit/routing.test.ts`** — unit-tests the functions exported here.

## Notes
- `jurisdictionScope` returns an empty object (not `null`) for unrestricted callers; downstream code must treat `{}` as "no filter" when merging into a Mongo query.
- `roleMayWorkRouteSet` is the *assignment* check (can this role receive the task?) and is deliberately stricter than `mayWork`: it verifies every individual rule in the set, not just the set name. A role that could read but not update a task would fail here.
- The file is a pure logic module with no I/O; all permission data comes from the kernel imports.
