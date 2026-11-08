---
source: src/modules/tasks/tests/unit/routing.test.ts
sha256: e352052919303d4aa065163cb6f89c24bbf406e16e9e251006fbefa756f1c085
generated_at: 2026-11-08T08:42:01.103281+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/unit/routing.test.ts

## Purpose

Unit tests for task routing and jurisdiction logic. Verifies that every task type (contact messages, account reviews, failed exports) is routed to a declared permission set, that an administrator holds all routed sets by virtue of role permissions (not a special case), and that `inJurisdiction` correctly grants or denies task visibility based on the caller's held sets.

## Key elements

- **`describe('routing')`** — asserts `CONTACT_ROUTE_SET === 'TaskDisplay'`; parameterised (`it.each`) checks that each task's `routeSet` appears in `PERMISSION_SETS`; parameterised check that every rule of the routed set is present in `permissionsOfRole('admin')`.
- **`describe('the jurisdiction of a system task')`** — exercises `inJurisdiction` with a `{ source: TaskSource.system, routeSet: 'UserBanning' }` task: visible to a moderator (holds `UserBanning`), hidden from support (does not), visible to admin. Also asserts a `TaskSource.visitor` task is visible to any caller regardless of sets held.
- **`NOW`** — fixed timestamp (`2030-05-01T10:00:00Z`) passed to opening factories to keep tests deterministic.

## Relationships

- **`src/modules/tasks/access.ts`** — the module under test; imports `heldRouteSets` and `inJurisdiction`.
- **`src/modules/tasks/domain/index.ts`** — re-exports `CONTACT_ROUTE_SET`, `accountReviewOpening`, `exportFailedOpening` used as routing fixtures.
- **`src/modules/tasks/domain/system.ts`** — likely origin of the opening factories (`accountReviewOpening`, `exportFailedOpening`) re-exported through `domain/index`.
- **`src/kernel/permissions.ts`** — imports `PERMISSION_SETS` and `permissionsOfRole` to validate routing declarations and admin coverage.
- **`src/types/index.ts`** — imports `TaskSource` (`TaskSource.system`, `TaskSource.visitor`) for jurisdiction assertions.
- **`tests/support/callers.ts`** — imports `callerAs` to construct role-scoped caller objects for visibility checks.

## Notes

- The admin routing test is explicitly framed as "with no special case": it checks that admin's permission set *contains every rule* of the routed set, rather than asserting a bypass. If admin permissions are ever refactored to a wildcard, this test will fail and signal the design change.
- Visitor-source tasks short-circuit set-based visibility — they are visible to all roles. This is the only visibility path that ignores `routeSet`.
- `it.each` tables are duplicated between the "declared set" and "admin holds" tests; adding a new task type requires updating both tables.
