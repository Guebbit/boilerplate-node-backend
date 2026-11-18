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
import { settleOutboxNudges } from '@kernel/outbox';
import { registerModules } from '@kernel/registry';
import { notificationsService } from '@modules/notifications';
import { paymentService } from '@modules/payments';
import { shopTimezone } from '@modules/shop';
import { dayInZone } from '@domain-primitives/time';
import { findAllTasks } from '@modules/tasks/tests/factories';
import { RefundFailureReason, TaskKind, TaskResolution, TaskStatus } from '@types';
import { enabledModules } from '../../../../modules';

// The queue, not the mail: opening a task tells the staff who work it.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
/** Stands in for the mail queue; the cases assert which mail was enqueued. */
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

/** A payment that exists as an id: the system reads it back as an ObjectId. */
const PAYMENT = new Types.ObjectId().toString();

/** An order that exists as an id: the system reads it back as an ObjectId to mail its buyer. */
const ORDER = new Types.ObjectId().toString();

/** Counter behind the outbox row ids the cases hand out. */
let eventCounter = 0;

/** A fresh outbox row id, as the relay would stamp one. */
const nextEventId = () => `event-${String(++eventCounter)}`;

beforeEach(() => {
    mockEnqueueEmail.mockReset();
    mockEnqueueEmail.mockResolvedValue(undefined);
    setEnvironment({ NODE_SUPPORT_EMAIL: 'desk@example.com', NODE_LEGAL_COUNTRY: 'IT' });
    resetDomainEvents();
    registerModules(enabledModules);
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** Every task in storage, oldest first. */
const allTasks = findAllTasks;

/** The one task in storage. */
const onlyTask = () =>
    allTasks().then((tasks) => {
        expect(tasks).toHaveLength(1);
        return tasks[0];
    });

/** The refund event payload the cases publish. */
const REFUND = {
    paymentId: PAYMENT,
    orderId: ORDER,
    refundId: 'ref1',
    amount: '10.00',
    currency: 'EUR'
};
/** The refund-reversed event payload the cases publish. */
const REVERSAL: DomainEventMap['payment.refund_reversed'] = {
    ...REFUND,
    failureReason: RefundFailureReason.declined
};
/** The refund-unrecorded event payload the cases publish. */
const UNRECORDED: DomainEventMap['payment.refund_unrecorded'] = {
    paymentId: PAYMENT,
    orderId: ORDER,
    refundRef: 're_dashboard_1',
    amount: '30.00',
    currency: 'EUR',
    reason: 'lost_race'
};
/** The dispute-opened event payload the cases publish. */
const DISPUTE: DomainEventMap['payment.dispute_opened'] = {
    paymentId: PAYMENT,
    orderId: ORDER,
    disputeId: 'dp1',
    kind: 'chargeback',
    status: 'needs_response',
    reason: 'fraudulent',
    amount: '10.00',
    currency: 'EUR',
    fundsWithdrawn: true,
    evidenceDueBy: '2031-01-10T00:00:00.000Z'
};
/** The fulfillment-delayed event payload the cases publish. */
const DELAY: DomainEventMap['fulfillment_order.delayed'] = {
    orderId: ORDER,
    orderNumber: '2026-000041',
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
        'payment.refund_reversed',
        () => emitDomainEvent('payment.refund_reversed', REVERSAL, { eventId: nextEventId() }),
        TaskKind.refund_reversed,
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
        'payment.refund_unrecorded',
        () => emitDomainEvent('payment.refund_unrecorded', UNRECORDED, { eventId: nextEventId() }),
        TaskKind.refund_unrecorded,
        'PaymentRefunding',
        'sales/payments?tab=attention'
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
            'a delay shipping outside the rule, from a shop outside it',
            'fulfillment_order.delayed',
            { ...DELAY, shipCountry: 'DE' }
        ],
        [
            'a delay to a buyer told there is no date',
            'fulfillment_order.delayed',
            { ...DELAY, promisedAt: undefined }
        ],
        [
            'a dispute decided before any to-do',
            'payment.dispute_opened',
            { ...DISPUTE, status: 'won' }
        ]
    ] as const)('opens nothing for %s', async (_name, name, payload) => {
        await emitDomainEvent(name, payload as never, { eventId: nextEventId() });
        expect(await allTasks()).toHaveLength(0);
    });
});

/** The payment's disputes as the listener reads them, standing in for a stored payment. */
const standing = (open: boolean) =>
    jest.spyOn(paymentService, 'disputeStanding').mockResolvedValue({ open, currency: 'EUR' });

describe('a refund the bank’s dispute refused or took back', () => {
    const DISPUTED = [
        [
            'refused for good',
            'payment.refund_failed',
            { ...REFUND, failureReason: RefundFailureReason.disputed, final: true },
            TaskKind.refund_refused
        ],
        [
            'sent back after settling',
            'payment.refund_reversed',
            { ...REVERSAL, failureReason: RefundFailureReason.disputed },
            TaskKind.refund_reversed
        ]
    ] as const;

    it.each(DISPUTED)(
        'is left to the dispute to-do while a dispute is open: %s',
        async (_name, name, payload) => {
            standing(true);

            await emitDomainEvent(name, payload as never, { eventId: nextEventId() });

            expect(await allTasks()).toHaveLength(0);
        }
    );

    it.each(DISPUTED)(
        'opens its own to-do when no dispute is open, telling staff to check the dispute: %s',
        async (_name, name, payload, kind) => {
            standing(false);

            await emitDomainEvent(name, payload as never, { eventId: nextEventId() });

            const task = await onlyTask();
            expect(task.kind).toBe(kind);
            expect(task.message).toContain("check it in the provider's dashboard");
        }
    );
});

describe('the delay rule follows the shop’s country', () => {
    it('counts every destination for a shop in the United States', async () => {
        setEnvironment({ NODE_LEGAL_COUNTRY: 'US' });

        await emitDomainEvent(
            'fulfillment_order.delayed',
            { ...DELAY, shipCountry: 'IT' },
            { eventId: nextEventId() }
        );

        const { kind: actualkind } = await onlyTask();

        expect(actualkind).toBe(TaskKind.consent_due);
    });

    it('counts a delay with no ship-to country for a shop in the United States', async () => {
        setEnvironment({ NODE_LEGAL_COUNTRY: 'US' });

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
            'a refund marked returned after the bank sent it back',
            () => emitDomainEvent('payment.refund_reversed', REVERSAL, { eventId: nextEventId() }),
            () => emitDomainEvent('payment.refunded', { ...REFUND, full: true })
        ],
        [
            'a closed dispute',
            () => emitDomainEvent('payment.dispute_opened', DISPUTE, { eventId: nextEventId() }),
            () => emitDomainEvent('payment.dispute_updated', { ...DISPUTE, status: 'lost' })
        ],
        [
            'order.canceled',
            () =>
                emitDomainEvent(
                    'inventory.hold_orphaned',
                    { orderId: ORDER },
                    { eventId: nextEventId() }
                ),
            () =>
                emitDomainEvent('order.canceled', {
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
            'fulfillment_order.canceled',
            () => emitDomainEvent('fulfillment_order.delayed', DELAY, { eventId: nextEventId() }),
            () =>
                emitDomainEvent('fulfillment_order.canceled', {
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

    it('opens one task for a refund the import gave up on, however often it is announced', async () => {
        await emitDomainEvent('payment.refund_unrecorded', UNRECORDED, { eventId: nextEventId() });
        await emitDomainEvent(
            'payment.refund_unrecorded',
            { ...UNRECORDED, refundRef: 're_dashboard_2', reason: 'other_currency' },
            { eventId: nextEventId() }
        );

        const task = await onlyTask();

        expect(task.kind).toBe(TaskKind.refund_unrecorded);
        expect(task.status).toBe(TaskStatus.new);
    });

    it('leaves an unrecorded refund for staff: no later event closes it', async () => {
        await emitDomainEvent('payment.refund_unrecorded', UNRECORDED, { eventId: nextEventId() });
        await emitDomainEvent('payment.refunded', { ...REFUND, full: true });

        const task = await onlyTask();

        expect(task.status).toBe(TaskStatus.new);
    });

    it('leaves a mismatch for staff: no later event closes it', async () => {
        await emitDomainEvent(
            'payment.amount_mismatch',
            { paymentId: PAYMENT, orderId: ORDER },
            { eventId: nextEventId() }
        );
        await emitDomainEvent('payment.refunded', { ...REFUND, full: true });
        await emitDomainEvent('order.canceled', {
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
        await settleOutboxNudges();

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
        await settleOutboxNudges();

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
        await settleOutboxNudges();

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
        await settleOutboxNudges();

        for (const address of ['manager@example.com', 'mod@example.com'])
            expect(linksMailedTo(address)).toEqual([
                expect.stringMatching(new RegExp(`/en/orders/${ORDER}$`))
            ]);
    });

    it('never reaches the contact main mailbox, even with nobody to tell', async () => {
        await emitDomainEvent('payment.dispute_opened', DISPUTE, { eventId: nextEventId() });
        await settleOutboxNudges();

        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });
});

/** The kinds of every task in storage, oldest first. */
const kinds = () => allTasks().then((tasks) => tasks.map((task) => task.kind));

describe('a dispute is two to-dos', () => {
    it('moves from the proof to the wait: closes `dispute`, opens one `dispute_awaiting_bank`', async () => {
        await emitDomainEvent('payment.dispute_opened', DISPUTE, { eventId: nextEventId() });

        await emitDomainEvent(
            'payment.dispute_updated',
            { ...DISPUTE, status: 'under_review' },
            { eventId: nextEventId() }
        );

        const tasks = await allTasks();
        expect(tasks.map((task) => [task.kind, task.status])).toEqual([
            [TaskKind.dispute, TaskStatus.resolved],
            [TaskKind.dispute_awaiting_bank, TaskStatus.new]
        ]);
        expect(tasks[0].resolution).toBe(TaskResolution.cleared);
        expect(tasks[0].notes.map((note) => note.body)).toEqual([
            'Proof sent; the bank is deciding.'
        ]);
        expect(tasks[1].routeSet).toBe('PaymentRefunding');
        expect(tasks[1].work).toBe('sales/payments?tab=attention');
    });

    it('opens nothing twice when the same report is delivered again', async () => {
        const meta = { eventId: nextEventId() };
        const under = { ...DISPUTE, status: 'under_review' } as const;
        await emitDomainEvent('payment.dispute_opened', DISPUTE, { eventId: nextEventId() });
        await emitDomainEvent('payment.dispute_updated', under, meta);

        await emitDomainEvent('payment.dispute_updated', under, meta);

        expect(await kinds()).toEqual([TaskKind.dispute, TaskKind.dispute_awaiting_bank]);
        const [, waiting] = await allTasks();
        expect(waiting.seenCount).toBe(1);
    });

    it.each(['won', 'lost', 'accepted', 'closed'] as const)(
        'closes the wait when the bank decides: %s, naming the outcome',
        async (status) => {
            await emitDomainEvent(
                'payment.dispute_opened',
                { ...DISPUTE, status: 'under_review' },
                { eventId: nextEventId() }
            );

            await emitDomainEvent('payment.dispute_updated', { ...DISPUTE, status });

            const tasks = await allTasks();
            const waiting = tasks.find((task) => task.kind === TaskKind.dispute_awaiting_bank);
            expect(waiting?.status).toBe(TaskStatus.resolved);
            expect(waiting?.notes.map((note) => note.body)).toEqual([
                `The dispute ended: ${status}.`
            ]);
        }
    );

    it.each([
        ['a lost chargeback in another currency than the payment', 'lost', 'USD', true],
        ['an accepted chargeback in another currency than the payment', 'accepted', 'USD', true],
        ['a lost chargeback in the payment’s currency', 'lost', 'EUR', false],
        ['a won chargeback in another currency than the payment', 'won', 'USD', false]
    ] as const)(
        'tells staff to check the amount for %s: %s',
        async (_name, status, currency, tellsStaff) => {
            jest.spyOn(paymentService, 'disputeStanding').mockResolvedValue({
                open: false,
                currency: 'EUR'
            });
            await emitDomainEvent('payment.dispute_opened', DISPUTE, { eventId: nextEventId() });

            await emitDomainEvent('payment.dispute_updated', { ...DISPUTE, status, currency });

            const [task] = await allTasks();
            const note = task.notes.map((entry) => entry.body).join(' ');
            expect(note.includes('check the amount in the provider')).toBe(tellsStaff);
        }
    );

    it('opens no waiting to-do when the bank decides straight from needs_response', async () => {
        await emitDomainEvent('payment.dispute_opened', DISPUTE, { eventId: nextEventId() });

        await emitDomainEvent('payment.dispute_updated', { ...DISPUTE, status: 'lost' });

        const tasks = await allTasks();
        expect(tasks.map((task) => [task.kind, task.status])).toEqual([
            [TaskKind.dispute, TaskStatus.resolved]
        ]);
    });

    it('dates the wait 75 days out and never reminds before the deadline', async () => {
        await emitDomainEvent(
            'payment.dispute_opened',
            { ...DISPUTE, status: 'under_review' },
            { eventId: nextEventId() }
        );

        const { dueAt, noDueSoon } = await onlyTask();

        const days = ((dueAt?.getTime() ?? 0) - Date.now()) / 86_400_000;
        expect(days).toBeGreaterThan(74.9);
        expect(days).toBeLessThanOrEqual(75);
        expect(noDueSoon).toBe(true);
    });
});

describe('a refund sent back by the bank', () => {
    const DAY_MS = 86_400_000;

    it('opens one to-do however often the same report is delivered', async () => {
        const meta = { eventId: nextEventId() };
        await emitDomainEvent('payment.refund_reversed', REVERSAL, meta);

        await emitDomainEvent('payment.refund_reversed', REVERSAL, meta);

        await expect(allTasks()).resolves.toHaveLength(1);
    });

    it('is not overdue when the law sets no deadline, however late the bank sent it back', async () => {
        await emitDomainEvent('payment.refund_reversed', REVERSAL, { eventId: nextEventId() });

        const { dueAt } = await onlyTask();

        expect((dueAt?.getTime() ?? 0) - Date.now()).toBeGreaterThan(0);
    });

    it('opens with the past legal date of a return refund reversed after day 14, and names the rule', async () => {
        const legal = new Date(Date.now() - 3 * DAY_MS);
        jest.spyOn(paymentService, 'refundLegalDue').mockResolvedValue({
            dueBy: legal,
            dueRule: 'withdrawal'
        });

        await emitDomainEvent('payment.refund_reversed', REVERSAL, { eventId: nextEventId() });

        const { dueAt, message } = await onlyTask();
        expect(dueAt).toEqual(legal);
        expect(message).toContain(
            `Legal refund deadline (withdrawal): ${dayInZone(legal, shopTimezone())}.`
        );
    });

    it('tells staff a faulty item is due now, on a refund refused for good', async () => {
        jest.spyOn(paymentService, 'refundLegalDue').mockResolvedValue({
            dueBy: new Date(Date.now() - DAY_MS),
            dueRule: 'faulty'
        });

        await emitDomainEvent(
            'payment.refund_failed',
            { ...REFUND, failureReason: 'declined', final: true },
            { eventId: nextEventId() }
        );

        const { message } = await onlyTask();
        expect(message).toContain('Legal refund deadline (faulty item): refund now.');
    });

    it('says nothing of a deadline when the law sets none', async () => {
        await emitDomainEvent('payment.refund_reversed', REVERSAL, { eventId: nextEventId() });

        const { message } = await onlyTask();
        expect(message).not.toContain('Legal refund deadline');
    });

    it('opens a refund refused late as refund_refused with a date still ahead, not overdue', async () => {
        await emitDomainEvent(
            'payment.refund_failed',
            { ...REFUND, failureReason: 'declined', final: true },
            { eventId: nextEventId() }
        );

        const { kind, dueAt } = await onlyTask();

        expect(kind).toBe(TaskKind.refund_refused);
        expect((dueAt?.getTime() ?? 0) - Date.now()).toBeGreaterThan(0);
    });
});
