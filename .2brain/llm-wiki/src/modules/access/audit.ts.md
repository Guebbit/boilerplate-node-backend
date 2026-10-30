---
source: src/modules/access/audit.ts
sha256: b65cedb01985178cd6820de7f57d5806f1f3910c5c412f7a6a668119d32e980c
generated_at: 2026-10-29T02:21:54.656872+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/audit.ts

## Purpose

Declares the audit-action vocabulary for the access module (role assignment and revocation) and registers it into the app-wide `AuditActionMap` via TypeScript module augmentation. It exists so that compliance queries can find access-mutating events by the `access.*` prefix while distinguishing them from read-only operations like `membershipsOf` or `rolesOf`.

## Key elements

- **`accessAuditActions`** – `as const` object exporting two string-literal action identifiers:
  - `ROLE_ASSIGNED` (`'access.role.assigned'`) – emitted when an admin grants a role to a membership.
  - `ROLE_REVOKED` (`'access.role.revoked'`) – emitted when a membership's role is removed.
- **`declare module '@infrastructure/observability/audit'`** – augments the shared `AuditActionMap` interface by adding an `access` key typed to the union of the two action strings, making them available type-safely to any consumer of that map.

## Relationships

- **`services/grants.ts` / `services/role-audit.ts`** – consume `accessAuditActions` as the action identifiers they attach to audit log entries when a grant or revocation is performed.
- **`services/memberships.ts`** – co-resident service in the same module; the file's comment contrasts its read-only actions (`membershipsOf`) with the mutating ones owned here.
- **`tests/factories.ts`** – provides test fixtures (likely audit-log entries) that reference these action strings.
- **`tests/integration/access.test.ts`** – exercises the access module end-to-end, asserting that the expected `access.role.*` actions appear in the audit trail.
- **`src/modules/users/tests/integration/admin-user-grant-atomicity.test.ts`** – verifies that a user-grant operation and its accompanying audit emission are atomic; depends on the action identifiers declared here.

## Notes

- The module-augmentation pattern (rather than a shared enum) is a deliberate project convention — see `modules/account/audit.ts` for the stated rationale. Each module owns its action strings locally.
- `ROLE_ASSIGNED` is documented as always admin-initiated (`update:User` / `create:User`); self-service role changes are out of scope for this action.
- Only the two `role` actions are mutation-class. Any future read helpers added to this module should *not* be added to `accessAuditActions` if they don't change permissions, so the `access.*` prefix stays scoped to compliance-relevant events.
