/**
 * @module
 * The shop's to-dos, driven the way production drives them: the real modules registered, a
 * payment, stock or delivery event emitted (with the `eventId` the outbox stamps), the task read
 * back from storage and the staff's bell and mail at the other end. Pins each opener and each
 * clearer, the screen each alert opens, who is told, and the delay rule's reach. The engine's own
 * rules (dedup, replays, staff closing first) are tested in `tasks`.
 */

import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { asRole } from '@tests/callers';
import { setEnvironment } from '@tests/environment';
import { createUser } from '@modules/users/tests/factories';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { emitDomainEvent, resetDomainEvents } from '@kernel/events';
import type { DomainEventMap } from '@kernel/events';
import { callerInScope } from '@kernel/permissions';
import { registerModules } from '@kernel/registry';
import { notificationsService } from '@modules/notifications';
import { findAllTasks } from '@modules/tasks/tests/factories';
import { RefundFailureReason, TaskKind, TaskResolution, TaskStatus } from '@types';
import { enabledModules } from '../../../../modules';

// The queue, not the mail: opening a task tells the staff who work it.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

/** A payment that exists as an id: the system reads it back as an ObjectId. */
const PAYMENT = new Types.ObjectId().toString();

/** An order that exists as an id: the system reads it back as an ObjectId to mail its buyer. */
const ORDER = new Types.ObjectId().toString();

let eventCounter = 0;

/** A fresh outbox row id, as the relay would stamp one. */
const nextEventId = () => `event-${String(++eventCounter)}`;

beforeEach(() => {
    mockEnqueueEmail.mockReset();
    mockEnqueueEmail.mockResolvedValue(undefined);
    setEnvironment({ NODE_CONTACT_NOTIFY_EMAIL: 'desk@example.com', NODE_SHOP_COUNTRY: 'IT' });
    resetDomainEvents();
    registerModules(enabledModules);
});

afterEach(() => resetDomainEvents());

/** Every task in storage, oldest first. */
const allTasks = findAllTasks;

/** The one task in storage. */
const onlyTask = () =>
    allTasks().then((tasks) => {
        expect(tasks).toHaveLength(1);
        return tasks[0];
    });

const REFUND = {
    paymentId: PAYMENT,
    orderId: ORDER,
    refundId: 'ref1',
    amount: 10,
    currency: 'EUR'
};
const DISPUTE: DomainEventMap['payment.dispute_opened'] = {
    paymentId: PAYMENT,
    orderId: ORDER,
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
    orderId: ORDER,
    fulfillmentOrderId: 'fo1',
    titles: ['Mug'],
    agreedAt: '2031-02-01T00:00:00.000Z',
    promisedAt: '2031-02-01T00:00:00.000Z',
    shipCountry: 'US',
    reason: 'due'
};

/** Each opener: the event, the kind it opens, its set, and the screen that does the work. */
const OPENERS = [
    [
        'payment.refund_owed_by_hand',
        () => emitDomainEvent('payment.refund_owed_by_hand', REFUND, { eventId: nextEventId() }),
        TaskKind.manual_refund_owed,
        'PaymentRefunding',
        'sales/payments?tab=attention'
    ],
    [
        'payment.refund_failed (final)',
        () =>
            emitDomainEvent(
                'payment.refund_failed',
                { ...REFUND, failureReason: 'declined', final: true },
                { eventId: nextEventId() }
            ),
        TaskKind.refund_refused,
        'PaymentRefunding',
        'sales/payments?tab=attention'
    ],
    [
        'payment.amount_mismatch',
        () =>
            emitDomainEvent(
                'payment.amount_mismatch',
                { paymentId: PAYMENT, orderId: ORDER },
                { eventId: nextEventId() }
            ),
        TaskKind.amount_mismatch,
        'AuditDisplay',
        `orders/${ORDER}`
    ],
    [
        'payment.dispute_opened',
        () => emitDomainEvent('payment.dispute_opened', DISPUTE, { eventId: nextEventId() }),
        TaskKind.dispute,
        'PaymentRefunding',
        'sales/payments?tab=attention'
    ],
    [
        'inventory.hold_orphaned',
        () =>
            emitDomainEvent(
                'inventory.hold_orphaned',
                { orderId: ORDER },
                { eventId: nextEventId() }
            ),
        TaskKind.paid_without_hold,
        'InventoryManagement',
        `orders/${ORDER}`
    ],
    [
        'fulfillment_order.delayed (US)',
        () => emitDomainEvent('fulfillment_order.delayed', DELAY, { eventId: nextEventId() }),
        TaskKind.consent_due,
        'OrderEditing',
        `orders/${ORDER}`
    ]
] as const;

describe('what opens a task', () => {
    it.each(OPENERS)(
        '%s opens one open system task in the right jurisdiction, naming its screen',
        async (_name, emit, kind, set, work) => {
            await emit();

            const task = await onlyTask();
            expect(task.kind).toBe(kind);
            expect(task.routeSet).toBe(set);
            expect(task.work).toBe(work);
            expect(task.status).toBe(TaskStatus.new);
            expect(task.source).toBe('system');
            expect(task.openKey).toBeDefined();
            expect(task.dueAt).toBeInstanceOf(Date);
        }
    );

    it('dates a dispute by the provider deadline', async () => {
        await emitDomainEvent('payment.dispute_opened', DISPUTE, { eventId: nextEventId() });
        const { dueAt: actualdueAt } = await onlyTask();
        expect(actualdueAt).toEqual(new Date(DISPUTE.evidenceDueBy!));
    });

    it('dates a consent reminder agreed + 30 days', async () => {
        await emitDomainEvent('fulfillment_order.delayed', DELAY, { eventId: nextEventId() });
        const { dueAt: actualdueAt } = await onlyTask();
        expect(actualdueAt).toEqual(new Date('2031-03-03T00:00:00.000Z'));
    });

    it('keeps the earlier due date when a repeat arrives', async () => {
        await emitDomainEvent('fulfillment_order.delayed', DELAY, { eventId: nextEventId() });
        const { dueAt: first } = await onlyTask();
        await emitDomainEvent(
            'fulfillment_order.delayed',
            { ...DELAY, promisedAt: '2031-06-01T00:00:00.000Z' },
            { eventId: nextEventId() }
        );

        const { dueAt: actualdueAt } = await onlyTask();

        expect(actualdueAt).toEqual(first);
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
            'a delay shipping outside the rule, from a shop outside it',
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
        expect(await allTasks()).toHaveLength(0);
    });
});

describe('the delay rule follows the shop’s country', () => {
    it('counts every destination for a shop in the United States', async () => {
        setEnvironment({ NODE_SHOP_COUNTRY: 'US' });

        await emitDomainEvent(
            'fulfillment_order.delayed',
            { ...DELAY, shipCountry: 'IT' },
            { eventId: nextEventId() }
        );

        const { kind: actualkind } = await onlyTask();

        expect(actualkind).toBe(TaskKind.consent_due);
    });

    it('counts a delay with no ship-to country for a shop in the United States', async () => {
        setEnvironment({ NODE_SHOP_COUNTRY: 'US' });

        await emitDomainEvent(
            'fulfillment_order.delayed',
            { ...DELAY, shipCountry: undefined },
            { eventId: nextEventId() }
        );

        const { kind: actualkind } = await onlyTask();

        expect(actualkind).toBe(TaskKind.consent_due);
    });

    it('counts a shipment to the United States from a shop elsewhere', async () => {
        await emitDomainEvent('fulfillment_order.delayed', DELAY, { eventId: nextEventId() });

        const { kind: actualkind } = await onlyTask();

        expect(actualkind).toBe(TaskKind.consent_due);
    });
});

describe('what closes a task', () => {
    it.each([
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
                    { orderId: ORDER },
                    { eventId: nextEventId() }
                ),
            () =>
                emitDomainEvent('order.cancelled', {
                    orderId: ORDER,
                    refund: true,
                    cause: 'operator'
                })
        ],
        [
            'shipment.shipped (the order)',
            () =>
                emitDomainEvent(
                    'inventory.hold_orphaned',
                    { orderId: ORDER },
                    { eventId: nextEventId() }
                ),
            () =>
                emitDomainEvent('shipment.shipped', {
                    orderId: ORDER,
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
                    orderId: ORDER,
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
                    orderId: ORDER,
                    fulfillmentOrderId: 'fo1'
                })
        ]
    ])('%s resolves it as cleared and frees the dedup key', async (_name, open, close) => {
        await open();
        await close();

        const task = await onlyTask();
        expect(task.status).toBe(TaskStatus.resolved);
        expect(task.resolution).toBe(TaskResolution.cleared);
        expect(task.closedAt).toBeInstanceOf(Date);
        expect(task.openKey).toBeUndefined();
    });

    it('leaves a mismatch for staff: no later event closes it', async () => {
        await emitDomainEvent(
            'payment.amount_mismatch',
            { paymentId: PAYMENT, orderId: ORDER },
            { eventId: nextEventId() }
        );
        await emitDomainEvent('payment.refunded', { ...REFUND, full: true });
        await emitDomainEvent('order.cancelled', {
            orderId: ORDER,
            refund: true,
            cause: 'operator'
        });

        const { status: actualstatus } = await onlyTask();

        expect(actualstatus).toBe(TaskStatus.new);
    });

    it('opens one task when two events race', async () => {
        await Promise.all([
            emitDomainEvent(
                'inventory.hold_orphaned',
                { orderId: ORDER },
                { eventId: nextEventId() }
            ),
            emitDomainEvent(
                'inventory.hold_orphaned',
                { orderId: ORDER },
                { eventId: nextEventId() }
            )
        ]);

        const { seenCount: actualseenCount } = await onlyTask();

        expect(actualseenCount).toBe(2);
    });
});

/** A staff member who can act: the role given, an authenticator app armed. */
const staff = (role: string, email: string) =>
    createUser(
        {
            email,
            username: email.split('@', 1).join(''),
            authenticatorEnabledAt: new Date()
        },
        role
    );

/** `userId` reading the bell as `role`, in the deployment's shop. */
const bellOf = (role: string, userId: string) =>
    notificationsService
        .listVisible(
            callerInScope({ ...asRole(role, userId), tenantId: DEPLOYMENT_TENANT_ID }, 'tenant')
        )
        .then(({ items }) => items);

/** The links of the per-person staff-notice mails queued to `address`. */
const linksMailedTo = (address: string) =>
    mockEnqueueEmail.mock.calls
        .filter(
            ([envelope, template]) =>
                envelope.to === address && template === 'notifications.staff-notice'
        )
        .map((call) => (call[2] as { link: string }).link);

describe('who is told, and where the alert takes them', () => {
    it('sends a moderator who is told of a refund to the payments that need attention', async () => {
        const moderator = await staff('moderator', 'mod@example.com');
        const support = await staff('support', 'support@example.com');

        await emitDomainEvent('payment.refund_owed_by_hand', REFUND, { eventId: nextEventId() });

        expect(linksMailedTo('mod@example.com')).toEqual([
            expect.stringMatching(/\/en\/sales\/payments\?tab=attention$/)
        ]);
        await expect(bellOf('moderator', moderator.id)).resolves.toMatchObject([
            { params: { kind: 'manual_refund_owed', work: 'sales/payments?tab=attention' } }
        ]);
        await expect(bellOf('support', support.id)).resolves.toEqual([]);
    });

    it('sends the warehouse to the order whose stock is missing', async () => {
        await staff('warehouse', 'warehouse@example.com');

        await emitDomainEvent(
            'inventory.hold_orphaned',
            { orderId: ORDER },
            { eventId: nextEventId() }
        );

        expect(linksMailedTo('warehouse@example.com')).toEqual([
            expect.stringMatching(new RegExp(`/en/orders/${ORDER}$`))
        ]);
    });

    it('tells administrators alone of an amount mismatch, and sends them to the order', async () => {
        const moderator = await staff('moderator', 'mod@example.com');
        await staff('admin', 'admin@example.com');

        await emitDomainEvent(
            'payment.amount_mismatch',
            { paymentId: PAYMENT, orderId: ORDER },
            { eventId: nextEventId() }
        );

        expect(linksMailedTo('admin@example.com')).toEqual([
            expect.stringMatching(new RegExp(`/en/orders/${ORDER}$`))
        ]);
        expect(linksMailedTo('mod@example.com')).toEqual([]);
        await expect(bellOf('moderator', moderator.id)).resolves.toEqual([]);
    });

    it('tells the managers and moderators who edit orders of a delay the buyer must be asked about', async () => {
        await staff('manager', 'manager@example.com');
        await staff('moderator', 'mod@example.com');

        await emitDomainEvent('fulfillment_order.delayed', DELAY, { eventId: nextEventId() });

        for (const address of ['manager@example.com', 'mod@example.com'])
            expect(linksMailedTo(address)).toEqual([
                expect.stringMatching(new RegExp(`/en/orders/${ORDER}$`))
            ]);
    });

    it('never reaches the contact fallback mailbox, even with nobody to tell', async () => {
        await emitDomainEvent('payment.dispute_opened', DISPUTE, { eventId: nextEventId() });

        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });
});
