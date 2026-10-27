/**
 * @module
 * Domain events this module emits, added by augmenting the kernel's payload map — see
 * `modules/orders/events.ts` for why augmentation rather than a central list. Both are internal:
 * no AsyncAPI channel and no webhook carries them. `notifications` turns them into the staff's
 * work notices, so a ticket is never alerted twice (once from its producer event, once from here).
 */

/** Registers this module's event payloads into the kernel's app-wide `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * A ticket was inserted (not a repeat of an open one, not spam). Closed codes and ids only:
         * the ticket page has the rest, and no visitor text rides a bus the outbox persists.
         */
        'ticket.opened': {
            tenantId: string;
            ticketId: string;
            kind: string;
            /** The permission set that works it; its holders are who hear of it. */
            routeSet: string;
            /** A contact ticket's category, when the visitor chose one. */
            category?: string;
        };

        /** Someone gave a ticket to a colleague (taking your own ticket does not emit this). */
        'ticket.assigned': {
            tenantId: string;
            ticketId: string;
            kind: string;
            routeSet: string;
            /** Who now holds it, and the only person told. */
            assigneeId: string;
            /** ISO instant of the assignment: a ticket handed back and forth tells each time. */
            assignedAt: string;
        };
    }
}

/** See `DomainEventMap['ticket.opened']` above. */
export const TICKET_OPENED = 'ticket.opened';

/** See `DomainEventMap['ticket.assigned']` above. */
export const TICKET_ASSIGNED = 'ticket.assigned';
