/**
 * @module
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 *
 * All three are `admin.` because they are the admin-facing writes to the user record. What a
 * person does to their own account is `account`'s vocabulary, not this module's.
 *
 * See: docs/modules/users.md
 */

/** The audit action vocabulary this module owns. */
export const usersAuditActions = {
    ADMIN_USER_CREATED: 'admin.user.created',
    ADMIN_USER_UPDATED: 'admin.user.updated',
    ADMIN_USER_DELETED: 'admin.user.deleted'
} as const;

/** Registers this module's actions into the app-wide `AuditActionMap` union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        users: (typeof usersAuditActions)[keyof typeof usersAuditActions];
    }
}
