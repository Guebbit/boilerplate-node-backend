/**
 * @module
 * What a caller may do to one ticket, decided on the server so no client re-implements the
 * lifecycle. Pure: the service resolves the caller's standing once and hands the facts in.
 */

import { TicketStatus } from '@types';
import { isOpen } from './lifecycle';

/** What the caller's standing amounts to for one ticket. */
export interface ActionFacts {
    status: TicketStatus;
    /** Holds `update:Ticket`, and the ticket's route set when it is a system ticket. */
    mayWork: boolean;
    /** Holds `delete:Ticket`, and the ticket's route set when it is a system ticket. */
    mayDelete: boolean;
    assigned: boolean;
}

/** The flags the wire carries as `actions`. */
export interface TicketActionFlags {
    resolve: boolean;
    markSpam: boolean;
    reopen: boolean;
    assign: boolean;
    unassign: boolean;
    note: boolean;
    delete: boolean;
}

/**
 * Each flag needs the right to work the ticket and a status the act can run from.
 *
 * @param facts - the ticket's status and the caller's standing
 */
export const actionsOf = ({
    status,
    mayWork,
    mayDelete,
    assigned
}: ActionFacts): TicketActionFlags => ({
    resolve: mayWork && status !== TicketStatus.resolved,
    markSpam: mayWork && status !== TicketStatus.spam,
    reopen: mayWork && !isOpen(status),
    assign: mayWork && isOpen(status),
    unassign: mayWork && isOpen(status) && assigned,
    note: mayWork,
    delete: mayDelete
});
