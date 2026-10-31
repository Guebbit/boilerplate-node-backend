/**
 * @module
 * The overdue sweep, against a real database: an open ticket past its due date is announced once
 * as `ticket.overdue`, stamped so it is never announced again, and a ticket closed (or not yet
 * due) before the sweep reaches it is left alone.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import type { DomainEventMap } from '@kernel/events';
import { ticketService } from '../../service';
import { ticketModel } from '@modules/tickets/model';
import { backdateDue, closeDirectly, createRefundTicket } from '../factories';
import { TICKET_OVERDUE } from '../../events';
import { TicketStatus } from '@types';

setupTestDb();

/** The `ticket.overdue` facts heard so far. */
let heard: DomainEventMap['ticket.overdue'][] = [];

beforeEach(() => {
    heard = [];
    resetDomainEvents();
    onDomainEvent(TICKET_OVERDUE, (fact) => {
        heard.push(fact);
    });
});

afterEach(() => resetDomainEvents());

const HOUR_MS = 3_600_000;

/** An open refund ticket whose deadline passed `hoursAgo` hours ago (negative: still ahead). */
const dueAgo = async (hoursAgo: number) => {
    const ticket = await createRefundTicket();
    await backdateDue(String(ticket._id), hoursAgo);
    return String(ticket._id);
};

describe('remindOverdue', () => {
    it('announces an open ticket past its due date, with its kind and route set', async () => {
        const id = await dueAgo(2);

        await expect(ticketService.remindOverdue()).resolves.toBe(1);

        expect(heard).toEqual([
            expect.objectContaining({
                ticketId: id,
                kind: 'manual_refund_owed',
                routeSet: 'PaymentRefunding'
            })
        ]);
    });

    it('stamps the ticket and never announces it a second time', async () => {
        const id = await dueAgo(2);

        await ticketService.remindOverdue();
        await expect(ticketService.remindOverdue()).resolves.toBe(0);

        expect(heard).toHaveLength(1);
        const stored = await ticketModel.findById(id).exec();
        expect(stored?.overdueNotifiedAt).toBeInstanceOf(Date);
    });

    it('skips a ticket closed before the sweep, and stamps nothing on it', async () => {
        const id = await dueAgo(2);
        await closeDirectly(id);

        await expect(ticketService.remindOverdue()).resolves.toBe(0);

        expect(heard).toEqual([]);
        const stored = await ticketModel.findById(id).exec();
        expect(stored?.overdueNotifiedAt).toBeUndefined();
    });

    it('leaves a ticket that is not due yet for a later sweep', async () => {
        const id = await dueAgo(-5);

        await expect(ticketService.remindOverdue()).resolves.toBe(0);
        await expect(ticketService.remindOverdue(new Date(Date.now() + 6 * HOUR_MS))).resolves.toBe(
            1
        );

        expect(heard.map((fact) => fact.ticketId)).toEqual([id]);
    });

    it('leaves a ticket with no due date alone', async () => {
        await createRefundTicket();

        await expect(ticketService.remindOverdue()).resolves.toBe(0);
    });

    it('announces a whole backlog in the order it went late', async () => {
        const newer = await dueAgo(1);
        const older = await dueAgo(9);

        await expect(ticketService.remindOverdue()).resolves.toBe(2);

        expect(heard.map((fact) => fact.ticketId)).toEqual([older, newer]);
    });

    it('does not announce a reopened ticket again: the deadline and the stamp both stay', async () => {
        const id = await dueAgo(2);
        await ticketService.remindOverdue();
        await closeDirectly(id);
        await ticketModel.updateOne(
            { _id: id },
            { $set: { status: TicketStatus.new }, $unset: { resolution: 1 } }
        );

        await expect(ticketService.remindOverdue()).resolves.toBe(0);
    });
});
