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
    ADMIN_TICKET_STATUS_UPDATED: 'admin.ticket.status_updated',
    ADMIN_TICKET_DELETED: 'admin.ticket.deleted'
} as const;

/** Registers this module's actions into the app-wide `AuditActionMap` union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        tickets: (typeof ticketsAuditActions)[keyof typeof ticketsAuditActions];
    }
}
