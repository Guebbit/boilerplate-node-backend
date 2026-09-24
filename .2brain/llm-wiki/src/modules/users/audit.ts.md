---
source: src/modules/users/audit.ts
sha256: 5769a8512d34f5159497052bebc4ec943ceb6db939ce03c089c43da35a0e37b0
generated_at: 2026-09-23T19:31:36.545830+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/audit.ts

## Purpose

Declares the audit-action vocabulary for admin-facing user-record mutations (create, update, soft-delete, erase, 2FA strip, ban/unban) and registers those actions into the app-wide `AuditActionMap` via a TypeScript module augmentation. It is purely declarative — no runtime logic beyond the `as const` export.

## Key elements

- **`usersAuditActions`** (`as const` object) — the six action strings owned by this module. Granularity is deliberate: soft-delete vs. erase, ban vs. generic update, so the audit log answers "what happened" without a reader diffing two row revisions.
- **`declare module '@infrastructure/observability/audit'`** — module augmentation that adds a `users` key to the `AuditActionMap` interface, typed as the union of the values above. This is how the action set becomes visible to the shared audit infrastructure without a shared enum.

## Relationships

- **`src/modules/users/service.ts`** — the primary consumer; its `auditActionForUpdate` helper (referenced in this file's comments) selects among the actions emitted here when an admin PUT is processed.
- **`src/modules/users/controllers/delete-users.ts`** — emits `ADMIN_USER_SOFT_DELETED` or `ADMIN_USER_ERASED` depending on which deletion path is taken.
- **`src/modules/users/tests/unit/audit.test.ts`** — unit-tests the export shape and the augmentation.
- **`src/modules/users/tests/integration/service.test.ts`** — asserts the correct action string is recorded for each service operation.
- **`tests/cross-cutting/audit-actions-registered.test.ts`** — cross-cutting guard that every module's actions are actually registered in `AuditActionMap`.

## Notes

- The augmentation pattern is intentional (see `modules/account/audit.ts` for rationale) — it avoids a shared enum while keeping each module's vocabulary local and tree-shakable.
- `audit-logs/model.ts` types the persisted `action` column as a widened `string` so that renaming an action in code does not invalidate historical rows; the constants here are the source of truth for *new* writes only.
- `ADMIN_USER_SOFT_DELETED` and `ADMIN_USER_ERASED` were deliberately split from a single "deleted" action: only the hard path scrubs the record, so conflating them would make "was the erasure request discharged?" unanswerable from the log alone.
- Ban/unban ride on the same `PUT` endpoint as every other update (see `service.ts`'s `auditActionForUpdate`); the distinct action strings exist so the trail is self-explanatory without revision diffing.
