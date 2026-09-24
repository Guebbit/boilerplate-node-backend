---
source: src/modules/access/audit.ts
sha256: 1cdb5f02c783144275e52ecd1fb824fa2dffd2a4d155b985d33f8fa9cfebd985
generated_at: 2026-09-23T17:56:54.036098+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/audit.ts

## Purpose

Declares the audit-action vocabulary owned by the access module and registers it into the app-wide `AuditActionMap` via TypeScript declaration merging. Only two events are audited—role assignment and role revocation—because those are the sole access-module actions that _change_ what a user may do; all other access-module functions are reads.

## Key elements

- **`accessAuditActions`** (const object, exported) — the two-action vocabulary:
    - `ROLE_ASSIGNED: 'access.role.assigned'` — emitted when an admin grants a role to a membership.
    - `ROLE_REVOKED: 'access.role.revoked'` — emitted when a role is removed.
- **`declare module '@infrastructure/observability/audit'`** — augments the global `AuditActionMap` interface so the `access` key is typed against the `accessAuditActions` values. This is the mechanism that lets downstream code reference `'access.role.assigned'` in a type-safe `AuditAction` union without importing a shared enum.

## Relationships

- **`src/modules/access/service.ts`** — the service layer that performs role grant/revoke operations; it is the expected caller of the `accessAuditActions` values when emitting audit events.
- **`src/modules/access/tests/integration/access.test.ts`** — integration tests that exercise the access service and assert the correct audit actions are recorded.

## Notes

- The module comment explicitly calls out that the design mirrors `modules/account/audit.ts`: each domain module augments `AuditActionMap` locally rather than contributing to a single shared enum. If you add a new audited action here, follow the same pattern (add the key to `accessAuditActions`, no other registration needed).
- The `as const` on `accessAuditActions` is load-bearing: the augmentation uses `(typeof accessAuditActions)[keyof typeof accessAuditActions]`, so widening to `string` would silently lose the literal-union type on `AuditActionMap.access`.
- The doc comment notes that role assignment is "never self-service" (requires `users.any.update` or `users.any.create`); this is a policy statement, not enforced in this file.
