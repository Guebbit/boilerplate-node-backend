/**
 * @module
 * Audit actions this module emits, declared by augmentation — see `modules/account/audit.ts` for
 * why, rather than a shared enum. `admin.` marks what only staff produce.
 */

/** The audit action strings this module fires, keyed by event. */
export const invoicingAuditActions = {
    /** Staff downloaded someone else's invoice PDF — financial and personal data leaving. */
    ADMIN_INVOICE_VIEWED: 'admin.invoice.viewed'
} as const;

/** Augments infrastructure's audit action map with this module's own action strings. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        invoicing: (typeof invoicingAuditActions)[keyof typeof invoicingAuditActions];
    }
}
