/**
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 *
 * A *read* is audited here, which is unusual and deliberate: feedback rows carry an email address
 * and free text from the public, so who looked at them is the question a data-protection review
 * actually asks. Contrast the product catalogue, where reads are public and auditing them would
 * record nothing worth keeping.
 */

export const feedbackAuditActions = {
    ADMIN_FEEDBACK_VIEWED: 'admin.feedback.viewed',
    ADMIN_FEEDBACK_STATUS_UPDATED: 'admin.feedback.status_updated'
} as const;

declare module '@infrastructure/observability/audit' {
    interface IAuditActionMap {
        feedback: (typeof feedbackAuditActions)[keyof typeof feedbackAuditActions];
    }
}
