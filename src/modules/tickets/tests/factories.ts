/**
 * @module
 * Ticket factories that touch the test database: a ticket a producer would have opened, written
 * past the domain rules a service enforces (so tests, and only tests, reach it).
 */

import { TicketKind, TicketResolution, TicketSource, TicketStatus } from '@types';
import { toObjectId } from '@infrastructure/persistence/create-repository';
import type { TicketDocument } from '../model';
import { ticketRepository } from '../repository';
import { ticketModel } from '../model';

/**
 * Persist an open system ticket about a refund owed by hand, the kind routed to
 * `PaymentRefunding`.
 *
 * @param subjectId - the account the ticket is about, when it is about one
 * @returns the stored ticket
 */
export const createRefundTicket = (subjectId?: string): Promise<TicketDocument> =>
    ticketRepository.create({
        source: TicketSource.system,
        kind: TicketKind.manual_refund_owed,
        routeSet: 'PaymentRefunding',
        subject: 'A refund is owed by hand',
        message: 'Refund r1 needs a person.',
        ...(subjectId === undefined ? {} : { subjectId: toObjectId(subjectId) })
    });

/**
 * Push a ticket's deadline into the past, as if time had gone by.
 *
 * @param id - the ticket
 * @param hoursAgo - how long ago it fell due (negative: still ahead)
 */
export const backdateDue = (id: string, hoursAgo = 1): Promise<unknown> =>
    ticketModel
        .updateOne({ _id: id }, { $set: { dueAt: new Date(Date.now() - hoursAgo * 3_600_000) } })
        .exec();

/**
 * Close a ticket straight in storage, past the doors, as staff would have.
 *
 * @param id - the ticket
 */
export const closeDirectly = (id: string): Promise<unknown> =>
    ticketModel
        .updateOne(
            { _id: id },
            { $set: { status: TicketStatus.resolved, resolution: TicketResolution.staff } }
        )
        .exec();
