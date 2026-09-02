# src/modules/users/audit.ts

## Purpose

Declares the user-module audit action vocabulary and registers it into the app-wide `AuditActionMap` via TypeScript module augmentation. It exists so that every admin-facing write to a user record (create, update, soft-delete, erase, 2FA strip) emits a typed, discoverable action string rather than a raw string literal scattered across service and controller code.

## Key elements

- **`usersAuditActions`** (exported `as const` object) — the five action identifiers this module owns:
  - `ADMIN_USER_CREATED` / `ADMIN_USER_UPDATED` — admin creates or edits a user record.
  - `ADMIN_USER_SOFT_DELETED` — reversible deletion (record retained, restorable).
  - `ADMIN_USER_ERASED` — irreversible hard-delete / GDPR erasure path.
  - `ADMIN_USER_2FA_DISABLED` — admin strips a user's second factor (the only non-self-service 2FA recovery path).
- **Module augmentation** (`declare module '@infrastructure/observability/audit'`) — adds a `users` key to `AuditActionMap` typed as the union of the values above, making them available to the audit logging infrastructure and to other modules that import the map.

## Relationships

- **`src/modules/users/service.ts`** — emits these action strings when performing the corresponding user mutations.
- **`src/modules/users/controllers/delete-users.ts`** — emits `ADMIN_USER_SOFT_DELETED` or `ADMIN_USER_ERASED` depending on the delete mode chosen.
- **`src/modules/users/tests/unit/audit.test.ts`** — unit-tests the action constants and their registration.
- **`tests/cross-cutting/audit-actions-registered.test.ts`** — verifies that every action declared here actually appears in the app-wide `AuditActionMap`, guarding against forgotten registrations.

## Notes

- Actions are declared by augmentation (not a shared enum) by design — the rationale is documented in `modules/account/audit.ts`. Follow the same pattern if adding new actions.
- The soft-delete / erase split is intentional: `audit-logs/model.ts` types `action` as a widened `string` so that renaming or splitting an action later does not invalidate already-stored audit rows.
- All actions are prefixed `admin.` because they represent admin-initiated writes; user self-service actions live under the `account` vocabulary. Do not mix the two prefixes here.
- Refer to `docs/modules/users.md` for the broader module context.
