/**
 * @module
 * Audit actions this module emits, declared by augmentation — see `modules/account/audit.ts` for
 * why, rather than a shared enum. All three are `admin.` because they are the admin-facing writes
 * to the user record; what a person does to their own account is `account`'s vocabulary.
 * See: docs/modules/users.md
 */

/** The audit action vocabulary this module owns. */
export const usersAuditActions = {
    ADMIN_USER_CREATED: 'admin.user.created',
    ADMIN_USER_UPDATED: 'admin.user.updated',
    /*
     * Split from one `ADMIN_USER_DELETED` so the audit trail can answer "was an
     * erasure request actually discharged" — only the hard path scrubs the record; a soft delete
     * is a restore waiting to happen. `audit-logs/model.ts` types `action` as a widened `string`
     * precisely so a renamed action does not invalidate stored history.
     */
    ADMIN_USER_SOFT_DELETED: 'admin.user.soft_deleted',
    ADMIN_USER_ERASED: 'admin.user.erased'
} as const;

/** Registers this module's actions into the app-wide `AuditActionMap` union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        users: (typeof usersAuditActions)[keyof typeof usersAuditActions];
    }
}
