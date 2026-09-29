/**
 * @module
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum. `admin.` marks what only staff can do.
 */

/** The audit action strings this module fires, keyed by event. */
export const returnsAuditActions = {
    RETURN_REQUESTED: 'return.requested',
    ADMIN_RETURN_APPROVED: 'admin.return.approved',
    ADMIN_RETURN_DECLINED: 'admin.return.declined'
} as const;

/** Augments infrastructure's audit action map with this module's own action strings. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        returns: (typeof returnsAuditActions)[keyof typeof returnsAuditActions];
    }
}
