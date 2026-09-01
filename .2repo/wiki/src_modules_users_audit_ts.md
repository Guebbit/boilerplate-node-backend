# src/modules/users/audit.ts

## Purpose

Declares the audit-action vocabulary for the users module and registers it into the app-wide `AuditActionMap` via TypeScript module augmentation. It exists so that every admin-facing write to a user record emits a typed, centrally-known action string.

## Key elements

- **`usersAuditActions`** (exported const) — Three string literals identifying admin writes to the user record: `admin.user.created`, `admin.user.updated`, `admin.user.deleted`. The `as const` assertion preserves literal types for downstream `satisfies` / type narrowing.
- **`declare module '@infrastructure/observability/audit'`** — Augments the shared `AuditActionMap` interface with a `users` key whose type is the union of the three literals. This is the registration point that makes the actions visible to the observability layer without a central enum.

## Relationships

- **`src/modules/users/service.ts`** — Consumes `ADMIN_USER_CREATED` / `ADMIN_USER_UPDATED` when performing the corresponding writes.
- **`src/modules/users/controllers/delete-users.ts`** — Consumes `ADMIN_USER_DELETED` when a user is removed.
- **`src/modules/users/tests/unit/audit.test.ts`** — Unit-tests the exported constants and the augmentation.

## Notes

- All actions carry the `admin.` prefix by convention: they represent an administrator acting *on* a user record. Self-service account actions (e.g. a user changing their own password) live under the `account` vocabulary in `modules/account/audit.ts`.
- The augmentation pattern (rather than a shared enum) is deliberate; the rationale is documented in the sibling `modules/account/audit.ts` file header.
- See `docs/modules/users.md` for broader module context.
