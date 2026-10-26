/**
 * @module
 * Audit actions this module emits, declared by augmentation — see `modules/account/audit.ts` for
 * why. Reads are audited too: ticket rows carry a stranger's email and free text, so who looked
 * is a data-protection question the public product catalogue's reads never raise. See
 * docs/modules/tickets.md.
 */

/** The audit action vocabulary this module owns. */
export const ticketsAuditActions = {
    ADMIN_TICKET_VIEWED: 'admin.ticket.viewed',
    ADMIN_TICKET_RESOLVED: 'admin.ticket.resolved',
    ADMIN_TICKET_MARKED_SPAM: 'admin.ticket.marked_spam',
    ADMIN_TICKET_REOPENED: 'admin.ticket.reopened',
    ADMIN_TICKET_ASSIGNED: 'admin.ticket.assigned',
    ADMIN_TICKET_UNASSIGNED: 'admin.ticket.unassigned',
    ADMIN_TICKET_NOTED: 'admin.ticket.noted',
    ADMIN_TICKET_DELETED: 'admin.ticket.deleted'
} as const;

/** Registers this module's actions into the app-wide `AuditActionMap` union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        tickets: (typeof ticketsAuditActions)[keyof typeof ticketsAuditActions];
    }
}
