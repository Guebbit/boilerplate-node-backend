/**
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 *
 * All three are `admin.` because they are the admin-facing writes to the user record. What a
 * person does to their own account is `account`'s vocabulary, not this module's.
 */

export const usersAuditActions = {
    ADMIN_USER_CREATED: 'admin.user.created',
    ADMIN_USER_UPDATED: 'admin.user.updated',
    ADMIN_USER_DELETED: 'admin.user.deleted'
} as const;

declare module '@infrastructure/observability/audit' {
    interface IAuditActionMap {
        users: (typeof usersAuditActions)[keyof typeof usersAuditActions];
    }
}
