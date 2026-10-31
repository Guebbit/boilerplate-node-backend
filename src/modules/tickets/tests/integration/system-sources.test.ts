/**
 * @module
 * The tickets the system opens and closes, driven the way production drives them: the real
 * modules registered, a producer's event emitted (with the `eventId` the outbox stamps), the
 * ticket read back from storage. Pins each opener and each clearer, the dedup (a repeat touches,
 * a redelivery is a no-op, two racing events open one ticket), and that staff closing first wins.
 */

import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { emitDomainEvent, onDomainEvent, resetDomainEvents } from '@kernel/events';
import { registerModules } from '@kernel/registry';
import type { DomainEventMap } from '@kernel/events';
import { ticketModel } from '@modules/tickets/model';
import { ticketRepository } from '@modules/tickets/repository';
import { TICKET_OPENED } from '../../events';
import { RefundFailureReason, TicketKind, TicketResolution, TicketStatus } from '@types';
import { enabledModules } from '../../../../modules';

// The queue, not the mail: opening a ticket tells the staff who work it.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

/** An account and a payment that exist as ids: the system reads them back as ObjectIds. */
const USER = new Types.ObjectId().toString();
const PAYMENT = new Types.ObjectId().toString();

let eventCounter = 0;

/** A fresh outbox row id, as the relay would stamp one. */
const nextEventId = () => `event-${String(++eventCounter)}`;

beforeEach(() => {
    mockEnqueueEmail.mockReset();
    mockEnqueueEmail.mockResolvedValue(undefined);
    setEnvironment({ NODE_CONTACT_NOTIFY_EMAIL: 'desk@example.com' });
    resetDomainEvents();
    registerModules(enabledModules);
});

afterEach(() => resetDomainEvents());

/** Every ticket in storage, oldest first. */
const allTickets = () => ticketModel.find().sort({ createdAt: 1 }).exec();

/** The one ticket in storage. */
const onlyTicket = () =>
    allTickets().then((tickets) => {
        expect(tickets).toHaveLength(1);
        return tickets[0];
    });

/** The one ticket's deadline. */
const dueAtOnly = () => onlyTicket().then(({ dueAt }) => dueAt);

/** The one ticket's status. */
const statusOnly = () => onlyTicket().then(({ status }) => status);

/** The one ticket's remembered event ids. */
const eventIdsOnly = () => onlyTicket().then(({ eventIds }) => eventIds);

/** Collects the tickets announced as opened. */
const watchOpened = () => {
    const opened = jest.fn();
    onDomainEvent(TICKET_OPENED, opened);
    return opened;
};

const REFUND = {
    paymentId: PAYMENT,
    orderId: 'ord1',
    refundId: 'ref1',
    amount: 10,
    currency: 'EUR'
};
const DISPUTE: DomainEventMap['payment.dispute_opened'] = {
    paymentId: PAYMENT,
    orderId: 'ord1',
    disputeId: 'dp1',
    kind: 'chargeback',
    status: 'needs_response',
    reason: 'fraudulent',
    amount: 10,
    currency: 'EUR',
    fundsWithdrawn: true,
    evidenceDueBy: '2031-01-10T00:00:00.000Z'
};
const DELAY: DomainEventMap['fulfillment_order.delayed'] = {
    orderId: 'ord1',
    fulfillmentOrderId: 'fo1',
    titles: ['Mug'],
    agreedAt: '2031-02-01T00:00:00.000Z',
    promisedAt: '2031-02-01T00:00:00.000Z',
    shipCountry: 'US',
    reason: 'due'
};

describe('what opens a ticket', () => {
    it.each([
        [
            'user.review_flagged',
            () =>
                emitDomainEvent(
                    'user.review_flagged',
                    { userId: USER },
                    { eventId: nextEventId() }
                ),
            TicketKind.account_review,
            'UserBanning'
        ],
        [
            'payment.refund_owed_by_hand',
            () =>
                emitDomainEvent('payment.refund_owed_by_hand', REFUND, { eventId: nextEventId() }),
            TicketKind.manual_refund_owed,
            'PaymentRefunding'
        ],
        [
            'payment.refund_failed (final)',
            () =>
                emitDomainEvent(
                    'payment.refund_failed',
                    { ...REFUND, failureReason: 'declined', final: true },
                    { eventId: nextEventId() }
                ),
            TicketKind.refund_refused,
            'PaymentRefunding'
        ],
        [
            'payment.amount_mismatch',
            () =>
                emitDomainEvent(
                    'payment.amount_mismatch',
                    { paymentId: PAYMENT, orderId: 'ord1' },
                    { eventId: nextEventId() }
                ),
            TicketKind.amount_mismatch,
            'PaymentRefunding'
        ],
        [
            'payment.dispute_opened',
            () => emitDomainEvent('payment.dispute_opened', DISPUTE, { eventId: nextEventId() }),
            TicketKind.dispute,
            'PaymentRefunding'
        ],
        [
            'inventory.hold_orphaned',
            () =>
                emitDomainEvent(
                    'inventory.hold_orphaned',
                    { orderId: 'ord1' },
                    { eventId: nextEventId() }
                ),
            TicketKind.paid_without_hold,
            'InventoryManagement'
        ],
        [
            'account.export_failed',
            () =>
                emitDomainEvent(
                    'account.export_failed',
                    { userId: USER, exportId: 'ex1' },
                    { eventId: nextEventId() }
                ),
            TicketKind.export_failed,
            'UserErasure'
        ],
        [
            'fulfillment_order.delayed (US)',
            () => emitDomainEvent('fulfillment_order.delayed', DELAY, { eventId: nextEventId() }),
            TicketKind.consent_due,
            'OrderEditing'
        ]
    ])(
        '%s opens one open system ticket in the right jurisdiction',
        async (_name, emit, kind, set) => {
            await emit();

            const ticket = await onlyTicket();
            expect(ticket.kind).toBe(kind);
            expect(ticket.routeSet).toBe(set);
            expect(ticket.status).toBe(TicketStatus.new);
            expect(ticket.source).toBe('system');
            expect(ticket.openKey).toBeDefined();
            expect(ticket.dueAt).toBeInstanceOf(Date);
        }
    );

    it('dates a dispute by the provider deadline', async () => {
        await emitDomainEvent('payment.dispute_opened', DISPUTE, { eventId: nextEventId() });
        expect(await dueAtOnly()).toEqual(new Date(DISPUTE.evidenceDueBy!));
    });

    it('dates a consent reminder agreed + 30 days', async () => {
        await emitDomainEvent('fulfillment_order.delayed', DELAY, { eventId: nextEventId() });
        expect(await dueAtOnly()).toEqual(new Date('2031-03-03T00:00:00.000Z'));
    });

    it.each([
        [
            'a refusal the sweep will retry',
            'payment.refund_failed',
            { ...REFUND, failureReason: 'provider_unavailable', final: false }
        ],
        [
            'a final refusal because the bank already took the money back',
            'payment.refund_failed',
            { ...REFUND, failureReason: RefundFailureReason.disputed, final: true }
        ],
        [
            'a delay shipping outside the rule',
            'fulfillment_order.delayed',
            { ...DELAY, shipCountry: 'DE' }
        ],
        [
            'a delay to a buyer told there is no date',
            'fulfillment_order.delayed',
            { ...DELAY, promisedAt: undefined }
        ],
        ['a dispute already decided', 'payment.dispute_opened', { ...DISPUTE, status: 'won' }]
    ] as const)('opens nothing for %s', async (_name, name, payload) => {
        await emitDomainEvent(name, payload as never, { eventId: nextEventId() });
        expect(await allTickets()).toHaveLength(0);
    });
});

describe('what closes a ticket', () => {
    it.each([
        [
            'user.review_cleared',
            () =>
                emitDomainEvent(
                    'user.review_flagged',
                    { userId: USER },
                    { eventId: nextEventId() }
                ),
            () => emitDomainEvent('user.review_cleared', { userId: USER })
        ],
        [
            'payment.refunded',
            () =>
                emitDomainEvent('payment.refund_owed_by_hand', REFUND, { eventId: nextEventId() }),
            () => emitDomainEvent('payment.refunded', { ...REFUND, full: true })
        ],
        [
            'payment.refund_canceled',
            () =>
                emitDomainEvent(
                    'payment.refund_failed',
                    { ...REFUND, failureReason: 'declined', final: true },
                    { eventId: nextEventId() }
                ),
            () => emitDomainEvent('payment.refund_canceled', REFUND)
        ],
        [
            'a closed dispute',
            () => emitDomainEvent('payment.dispute_opened', DISPUTE, { eventId: nextEventId() }),
            () => emitDomainEvent('payment.dispute_updated', { ...DISPUTE, status: 'lost' })
        ],
        [
            'order.cancelled',
            () =>
                emitDomainEvent(
                    'inventory.hold_orphaned',
                    { orderId: 'ord1' },
                    { eventId: nextEventId() }
                ),
            () =>
                emitDomainEvent('order.cancelled', {
                    orderId: 'ord1',
                    refund: true,
                    cause: 'operator'
                })
        ],
        [
            'shipment.shipped (the order)',
            () =>
                emitDomainEvent(
                    'inventory.hold_orphaned',
                    { orderId: 'ord1' },
                    { eventId: nextEventId() }
                ),
            () =>
                emitDomainEvent('shipment.shipped', {
                    orderId: 'ord1',
                    shipmentId: 's1',
                    fulfillmentOrderId: 'fo9',
                    lines: []
                })
        ],
        [
            'shipment.shipped (the delayed fulfillment order)',
            () => emitDomainEvent('fulfillment_order.delayed', DELAY, { eventId: nextEventId() }),
            () =>
                emitDomainEvent('shipment.shipped', {
                    orderId: 'ord1',
                    shipmentId: 's1',
                    fulfillmentOrderId: 'fo1',
                    lines: []
                })
        ],
        [
            'fulfillment_order.cancelled',
            () => emitDomainEvent('fulfillment_order.delayed', DELAY, { eventId: nextEventId() }),
            () =>
                emitDomainEvent('fulfillment_order.cancelled', {
                    orderId: 'ord1',
                    fulfillmentOrderId: 'fo1'
                })
        ],
        [
            'a later account.export_ready',
            () =>
                emitDomainEvent(
                    'account.export_failed',
                    { userId: USER, exportId: 'ex1' },
                    { eventId: nextEventId() }
                ),
            () => emitDomainEvent('account.export_ready', { userId: USER, exportId: 'ex2' })
        ]
    ])('%s resolves it as cleared and frees the dedup key', async (_name, open, close) => {
        await open();
        await close();

        const ticket = await onlyTicket();
        expect(ticket.status).toBe(TicketStatus.resolved);
        expect(ticket.resolution).toBe(TicketResolution.cleared);
        expect(ticket.closedAt).toBeInstanceOf(Date);
        expect(ticket.openKey).toBeUndefined();
    });

    it('leaves a mismatch for staff: no later event closes it', async () => {
        await emitDomainEvent(
            'payment.amount_mismatch',
            { paymentId: PAYMENT, orderId: 'ord1' },
            { eventId: nextEventId() }
        );
        await emitDomainEvent('payment.refunded', { ...REFUND, full: true });
        await emitDomainEvent('order.cancelled', {
            orderId: 'ord1',
            refund: true,
            cause: 'operator'
        });

        expect(await statusOnly()).toBe(TicketStatus.new);
    });

    it('is a no-op on a ticket staff already closed, and keeps their notes', async () => {
        await emitDomainEvent('user.review_flagged', { userId: USER }, { eventId: nextEventId() });
        const { _id } = await onlyTicket();
        await ticketRepository.appendNote(String(_id), { body: 'looked into it', at: new Date() });
        await ticketModel.updateOne(
            { _id },
            {
                $set: {
                    status: TicketStatus.resolved,
                    resolution: TicketResolution.staff,
                    closedAt: new Date()
                },
                $unset: { openKey: 1 }
            }
        );

        await emitDomainEvent('user.review_cleared', { userId: USER });

        const ticket = await onlyTicket();
        expect(ticket.resolution).toBe(TicketResolution.staff);
        expect(ticket.notes).toHaveLength(1);
    });
});

describe('dedup', () => {
    it('touches the open ticket on a repeat of the situation, and announces nothing twice', async () => {
        const opened = watchOpened();

        await emitDomainEvent(
            'inventory.hold_orphaned',
            { orderId: 'ord1' },
            { eventId: nextEventId() }
        );
        await emitDomainEvent(
            'inventory.hold_orphaned',
            { orderId: 'ord1' },
            { eventId: nextEventId() }
        );

        const ticket = await onlyTicket();
        expect(ticket.seenCount).toBe(2);
        expect(opened).toHaveBeenCalledTimes(1);
    });

    it('keeps the earlier due date when a repeat arrives', async () => {
        await emitDomainEvent('fulfillment_order.delayed', DELAY, { eventId: nextEventId() });
        const first = await dueAtOnly();
        await emitDomainEvent(
            'fulfillment_order.delayed',
            { ...DELAY, promisedAt: '2031-06-01T00:00:00.000Z' },
            { eventId: nextEventId() }
        );

        expect(await dueAtOnly()).toEqual(first);
    });

    it('ignores a redelivery of the same event, even after the ticket closed', async () => {
        const eventId = nextEventId();
        await emitDomainEvent('user.review_flagged', { userId: USER }, { eventId });
        await emitDomainEvent('user.review_cleared', { userId: USER });

        await emitDomainEvent('user.review_flagged', { userId: USER }, { eventId });

        const tickets = await allTickets();
        expect(tickets).toHaveLength(1);
        expect(tickets[0].status).toBe(TicketStatus.resolved);
    });

    it('opens a new ticket when the same situation returns after it closed', async () => {
        await emitDomainEvent('user.review_flagged', { userId: USER }, { eventId: nextEventId() });
        await emitDomainEvent('user.review_cleared', { userId: USER });
        await emitDomainEvent('user.review_flagged', { userId: USER }, { eventId: nextEventId() });

        const tickets = await allTickets();
        expect(tickets.map(({ status }) => status)).toEqual([
            TicketStatus.resolved,
            TicketStatus.new
        ]);
    });

    it('opens one ticket when two events race', async () => {
        await Promise.all([
            emitDomainEvent(
                'inventory.hold_orphaned',
                { orderId: 'ord1' },
                { eventId: nextEventId() }
            ),
            emitDomainEvent(
                'inventory.hold_orphaned',
                { orderId: 'ord1' },
                { eventId: nextEventId() }
            )
        ]);

        const ticket = await onlyTicket();
        expect(ticket.seenCount).toBe(2);
    });

    it('remembers only the last events, so a ticket does not grow without bound', async () => {
        for (let index = 0; index < 25; index++)
            await emitDomainEvent(
                'inventory.hold_orphaned',
                { orderId: 'ord1' },
                { eventId: nextEventId() }
            );

        expect(await eventIdsOnly()).toHaveLength(20);
    });
});
