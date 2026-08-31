/**
 * @module
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 *
 * A *read* is audited here, which is unusual and deliberate: feedback rows carry an email address
 * and free text from the public, so who looked at them is the question a data-protection review
 * actually asks. Contrast the product catalogue, where reads are public and auditing them would
 * record nothing worth keeping.
 *
 * See: docs/modules/feedback.md
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
