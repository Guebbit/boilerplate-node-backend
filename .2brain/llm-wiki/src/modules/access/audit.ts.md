---
source: src/modules/access/audit.ts
sha256: b65cedb01985178cd6820de7f57d5806f1f3910c5c412f7a6a668119d32e980c
generated_at: 2026-11-08T03:56:02.198425+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/audit.ts

## Purpose

Declares the audit-action vocabulary for the `access` module and registers it into the app-wide `AuditActionMap` via TypeScript declaration merging. Only two actions exist here (`access.role.assigned`, `access.role.revoked`) because role grant/revocation is the sole operation in this module that changes a user's permissions; all other access operations (e.g. `membershipsOf`, `rolesOf`) are reads and do not emit audit events. Compliance queries can filter by the `access.*` prefix.

## Key elements

- **`accessAuditActions`** (`as const` object) — the two literal action strings:
  - `ROLE_ASSIGNED: 'access.role.assigned'` — a membership was given a role (admin-initiated, never self-service).
  - `ROLE_REVOKED: 'access.role.revoked'` — a membership's role was removed.
- **`declare module '@infrastructure/observability/audit'`** — augments the global `AuditActionMap` interface so the `access` namespace resolves to the union of the two values above. This is the mechanism (chosen over a shared enum, per the module comment) that lets other modules type their audit calls against this vocabulary.

## Relationships

- **`services/grants.ts`** / **`services/memberships.ts`** / **`services/role-audit.ts`** — the runtime services that presumably call the audit logger using one of the two action strings defined here.
- **`tests/factories.ts`**, **`tests/integration/access.test.ts`**, **`src/modules/users/tests/integration/admin-user-grant-atomicity.test.ts`** — test files that exercise or assert on these audit actions.

## Notes

- The `declare module` augmentation means this file has **no runtime code**; it is purely a type-level contribution. Removing it would break type-checking of any file that references `AuditActionMap['access']`.
- The file intentionally does *not* use a shared enum. The module doc comment points to `modules/account/audit.ts` for the rationale (per-module augmentation keeps each module's vocabulary local).
- Both actions are admin-initiated; there is no self-service path, as noted in the `ROLE_ASSIGNED` JSDoc.
