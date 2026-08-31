/**
 * @module
 * Audit actions this module emits, declared by augmentation — see `modules/account/audit.ts` for
 * why. Reads are audited too: feedback rows carry a stranger's email and free text, so who looked
 * is a data-protection question the public product catalogue's reads never raise. See
 * docs/modules/feedback.md.
 */

/** The audit action vocabulary this module owns. */
export const feedbackAuditActions = {
    ADMIN_FEEDBACK_VIEWED: 'admin.feedback.viewed',
    ADMIN_FEEDBACK_STATUS_UPDATED: 'admin.feedback.status_updated'
} as const;

/** Registers this module's actions into the app-wide `AuditActionMap` union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        feedback: (typeof feedbackAuditActions)[keyof typeof feedbackAuditActions];
    }
}
