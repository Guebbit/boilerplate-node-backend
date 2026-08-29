# src/modules/users/audit.ts

## Purpose

Defines the audit-action string constants for admin-initiated user-record writes (create, update, delete) and registers them in the shared `AuditActionMap` via module augmentation. This file exists so that audit events emitted by the users module are type-safe and use a consistent `admin.user.*` vocabulary, distinct from the `account.*` vocabulary used for self-service actions in `modules/account`.

## Key elements

- **`usersAuditActions`** (exported `const`): Object with three keys — `ADMIN_USER_CREATED`, `ADMIN_USER_UPDATED`, `ADMIN_USER_DELETED` — mapping to the string literals `'admin.user.created'`, `'admin.user.updated'`, `'admin.user.deleted'`. The `as const` makes the values literal-typed.
- **Module augmentation of `@infrastructure/observability/audit`**: Declares `users: (typeof usersAuditActions)[keyof typeof usersAuditActions]` on the `AuditActionMap` interface, allowing the observability layer to reference these actions in a type-safe manner without a shared enum.

## Relationships

- **`src/modules/users/service.ts`** — The service layer that performs user CRUD operations; expected to emit these audit actions when a user is created, updated, or deleted by an admin.
- **`src/modules/users/controllers/delete-users.ts`** — Controller that triggers the deletion flow; the resulting audit event would use `ADMIN_USER_DELETED`.
- **`src/modules/users/tests/unit/audit.test.ts`** — Unit test covering the constant values and/or the module-augmentation typing.

## Notes

- The `admin.` prefix is deliberate: this module's vocabulary covers *admin-facing* writes to the user record. Self-service account actions (a person editing their own profile) belong to the `account` module's vocabulary, not here.
- Actions are declared by **module augmentation** rather than a shared enum, per the convention established in `modules/account/audit.ts`. Adding a new user audit action requires extending both the object literal and the augmentation in the same file.
- Because the values are plain string literals (not an enum), string-comparison sites outside this module will not get compile-time narrowing unless they go through the augmented `AuditActionMap`.
