/**
 * @module
 * Ticket factories that touch the test database: a ticket a producer would have opened, written
 * past the domain rules a service enforces (so tests, and only tests, reach it).
 */

import { TicketKind, TicketSource } from '@types';
import type { TicketDocument } from '../model';
import { ticketRepository } from '../repository';

/**
 * Persist an open system ticket about a refund owed by hand, the kind routed to
 * `PaymentRefunding`.
 *
 * @returns the stored ticket
 */
export const createRefundTicket = (): Promise<TicketDocument> =>
    ticketRepository.create({
        source: TicketSource.system,
        kind: TicketKind.manual_refund_owed,
        routeSet: 'PaymentRefunding',
        subject: 'A refund is owed by hand',
        message: 'Refund r1 needs a person.'
    });
