/**
 * @module
 * The overdue reminder: an open ticket past its due date is announced once, as `ticket.overdue`.
 * The tickets engine owns the sweep because it owns the clock (`dueAt`) and the memory
 * (`overdueNotifiedAt`); who hears of it is `notifications`' business, the same as for the opener.
 *
 * See: docs/modules/tickets.md#the-overdue-reminder
 */

import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { emitDomainEvent } from '@kernel/events';
import { TICKET_OVERDUE } from '../events';
import { ticketRepository } from '../repository';

/**
 * Remind once about every open ticket that has passed its due date.
 *
 * Each ticket is claimed (stamped) by one conditional write BEFORE it is announced, so two
 * overlapping sweeps, or a re-run after a crash, can never announce the same ticket twice. The
 * price is at-most-once: a crash between the stamp and the event loses that one reminder.
 * A ticket closed (or spam-marked) before the sweep reaches it is not claimed at all.
 *
 * Tickets are told one after another: a backlog is a handful. A failing announcement rejects the
 * sweep and stops it; that ticket is already stamped, so its reminder is lost, and the tickets
 * not yet claimed wait for the next run.
 *
 * @param now - the clock; the sweep's single reading of "overdue"
 * @returns how many tickets were announced
 */
export const remindOverdue = async (now: Date = new Date()): Promise<number> => {
    let announced = 0;

    for (let ticket = await ticketRepository.claimOverdue(now); ticket; ) {
        await emitDomainEvent(TICKET_OVERDUE, {
            tenantId: DEPLOYMENT_TENANT_ID,
            ticketId: String(ticket._id),
            kind: ticket.kind,
            routeSet: ticket.routeSet,
            ...(ticket.category ? { category: ticket.category } : {})
        });
        announced += 1;
        ticket = await ticketRepository.claimOverdue(now);
    }

    return announced;
};
