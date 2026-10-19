/**
 * @module
 * The cancel doors (`cancelOnRequestById` and the system's own) — the customer's one order write,
 * and the invariants that make it safe to expose: the status gate and the write are one statement, so no interleaving can cancel
 * a shipped order; the caller's scope rides in the same statement, so "someone else's order" and
 * "no such order" are the same 404; and the refusal reasons map to different statuses (404 vs
 * 409) because a client can act on that difference.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import {
    createOrder,
    markOrderPaidAt,
    setWithdrawUntil,
    timelineOf,
    toOrderItem
} from '@modules/orders/tests/factories';
import { orderService } from '@modules/orders/services';
import { ORDER_CANCELLED } from '../../events';
import { orderRepository } from '../../repository';
import { orderModel } from '../../model';
import { OrderStatus } from '@types';
import { markDomainEventsWired, onDomainEvent, resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { registerModules } from '@kernel/registry';
import ordersModule from '../../module';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { userService } from '@modules/users';
import * as auditPort from '@infrastructure/observability/audit';
import * as analyticsPort from '@infrastructure/observability/analytics';
import { ordersAuditActions } from '../../audit';
import { ordersAnalyticsEvents } from '../../analytics';
import { observePort } from '@tests/ports';
import {
    asCustomer,
    asAdmin,
    asModerator,
    asWarehouse,
    callerContextAs,
    testCallerContext
} from '@tests/callers';
import { cancelForErasureById } from '../../services/cancel';

// The queue, not the copy.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

/*
 * The audit port is REPLACED, not spied on: `jest.spyOn` cannot redefine the non-configurable
 * getter a CommonJS namespace import exposes, which fails under `jest.config.mutation.js`'s swc
 * transform and inside Stryker's sandbox. See `tests/support/ports.ts` for the full reasoning.
 */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

/* Replaced for the same reason as the audit port above. */
jest.mock('@infrastructure/observability/analytics', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/analytics'),
    emitAnalyticsEvent: jest.fn()
}));

setupTestDb();

afterEach(() => jest.restoreAllMocks());

const seedOrder = async (user: Awaited<ReturnType<typeof createUser>>) => {
    const product = await createProduct();
    return createOrder(user, [toOrderItem(product, 1)]);
};

const asUser = (user: { id: string }) => asCustomer(user.id);

describe('cancelOnRequestById', () => {
    it('cancels a pending order for its owner', async () => {
        const user = await createUser();
        const order = await seedOrder(user);

        const result = await orderService.cancelOnRequestById(String(order._id), asUser(user));

        expect(result.success).toBe(true);
        const stored = await orderRepository.findById(String(order._id));
        expect(stored?.status).toBe('cancelled');
    });

    it("refuses another user's order with 404 — indistinguishable from absence", async () => {
        const owner = await createUser({ email: 'owner@example.com', username: 'admin' });
        const stranger = await createUser({ email: 'stranger@example.com', username: 'stranger' });
        const order = await seedOrder(owner);

        const result = await orderService.cancelOnRequestById(String(order._id), asUser(stranger));

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
        // And nothing moved.
        const stored = await orderRepository.findById(String(order._id));
        expect(stored?.status).toBe('pending');
    });

    it('refuses a shipped order with 409 and the stable code', async () => {
        const user = await createUser();
        const order = await seedOrder(user);
        await orderRepository.updateStatusIfIn(String(order._id), ['pending'], 'shipped');

        const result = await orderService.cancelOnRequestById(String(order._id), asUser(user));

        expect(result.success).toBe(false);
        expect(result.status).toBe(409);
        expect(!result.success && result.errors[0]).toMatchObject({
            code: 'ORDER_NOT_CANCELLABLE'
        });
        const stored = await orderRepository.findById(String(order._id));
        expect(stored?.status).toBe('shipped');
    });

    it('a shop owner cancels an order they do not own', async () => {
        const owner = await createUser({ email: 'owner@example.com', username: 'admin' });
        const admin = await createUser(
            {
                email: 'boss@example.com',
                username: 'boss'
            },
            'admin'
        );
        const order = await seedOrder(owner);

        const result = await orderService.cancelOnRequestById(String(order._id), asAdmin(admin.id));

        expect(result.success).toBe(true);
    });

    /**
     * `processing → cancelled` belongs to `admin` alone, and this is the only path that can run
     * it — `update()` refuses to execute the transition otherwise. Read as `customer` regardless
     * of caller, this edge would silently exist in the table for everyone.
     */
    it('an operator cancels a processing order, which a customer cannot', async () => {
        const owner = await createUser({ email: 'owner@example.com', username: 'admin' });
        const order = await seedOrder(owner);
        await orderRepository.updateStatusIfIn(String(order._id), ['pending'], 'processing');

        const refused = await orderService.cancelOnRequestById(String(order._id), asUser(owner));
        expect(refused.success).toBe(false);
        expect(refused.status).toBe(409);

        const allowed = await orderService.cancelOnRequestById(String(order._id), asAdmin());

        expect(allowed.success).toBe(true);
        const stored = await orderRepository.findById(String(order._id));
        expect(stored?.status).toBe('cancelled');
    });

    /**
     * The reservation-sweep expiry (the system actor) must never cancel an order that has
     * already been paid, even when its own deadline check runs just after payment landed —
     * `pending.cancelled` is the ONLY edge the system actor holds, unlike `admin`'s wider one.
     */
    it("the system actor cannot cancel an order that is already paid — closes B21's race", async () => {
        const owner = await createUser({ email: 'owner@example.com', username: 'admin' });
        const order = await seedOrder(owner);
        await orderRepository.updateStatusIfIn(String(order._id), ['pending'], 'paid');

        const refused = await cancelForErasureById(String(order._id));

        expect(refused.success).toBe(false);
        expect(refused.status).toBe(409);
        const stored = await orderRepository.findById(String(order._id));
        expect(stored?.status).toBe('paid');
    });

    it('a soft-deleted order is a 404 for its owner — hidden means hidden', async () => {
        const user = await createUser();
        const order = await seedOrder(user);
        order.deletedAt = new Date();
        await orderRepository.save(order);

        const result = await orderService.cancelOnRequestById(String(order._id), asUser(user));

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });
});

describe('cancelOnRequestById — who gets their money back', () => {
    /** The cancellation event, captured rather than acted on. */
    const cancellations: { orderId: string; refund: boolean }[] = [];

    beforeEach(() => {
        cancellations.length = 0;
        // The outbox relay only delivers in a process whose modules are subscribed.
        markDomainEventsWired();
        onDomainEvent(ORDER_CANCELLED, (payload) => {
            cancellations.push(payload);
            return undefined;
        });
    });

    afterEach(() => {
        resetDomainEvents();
    });

    it('refunds a customer whatever they ask for', async () => {
        // Not the customer's to waive: `paid` is cancellable BECAUSE the money comes back.
        const user = await createUser();
        const order = await seedOrder(user);

        await orderService.cancelOnRequestById(String(order._id), asUser(user), { refund: false });

        await settleOutboxNudges();

        expect(cancellations).toEqual([
            { orderId: String(order._id), refund: true, cause: 'customer' }
        ]);
    });

    it('lets an operator cancel without returning the money', async () => {
        const user = await createUser();
        const order = await seedOrder(user);

        await orderService.cancelOnRequestById(String(order._id), asAdmin(), { refund: false });

        await settleOutboxNudges();

        expect(cancellations).toEqual([
            { orderId: String(order._id), refund: false, cause: 'operator' }
        ]);
    });

    it('refunds by default when an operator says nothing', async () => {
        const user = await createUser();
        const order = await seedOrder(user);

        await orderService.cancelOnRequestById(String(order._id), asAdmin());

        await settleOutboxNudges();

        expect(cancellations).toEqual([
            { orderId: String(order._id), refund: true, cause: 'operator' }
        ]);
    });

    it('lets a moderator cancel without returning the money too', async () => {
        // The bug this pins: `update:Order` is held by name, not through the scope
        // wildcard a moderator never holds — asking for the wildcard alone forced a refund
        // this operator had a reason not to make.
        const user = await createUser();
        const order = await seedOrder(user);

        await orderService.cancelOnRequestById(String(order._id), asModerator(), { refund: false });

        await settleOutboxNudges();

        expect(cancellations).toEqual([
            { orderId: String(order._id), refund: false, cause: 'operator' }
        ]);
    });

    it('announces the cancellation either way', async () => {
        // The event states a FACT. Suppressing it for a no-refund cancel would make the record of
        // what happened depend on what was compensated.
        const user = await createUser();
        const order = await seedOrder(user);

        await orderService.cancelOnRequestById(String(order._id), asAdmin(), { refund: false });

        await settleOutboxNudges();

        expect(cancellations).toHaveLength(1);
    });
});

describe('cancelOnRequestById — audit and analytics', () => {
    it('a customer cancel reports order_cancelled, audited as the customer', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);
        const user = await createUser();
        const order = await seedOrder(user);

        await orderService.cancelOnRequestById(
            String(order._id),
            asUser(user),
            {},
            testCallerContext
        );

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: ordersAuditActions.ORDER_CANCELLED,
                outcome: 'success',
                actorRole: 'anonymous'
            })
        );
        expect(analyticsSpy).toHaveBeenCalledWith(
            expect.objectContaining({ event: ordersAnalyticsEvents.ORDER_CANCELLED })
        );
    });

    it('an operator cancel that keeps the money says so in the audit row and on the timeline', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser();
        const order = await seedOrder(user);

        await orderService.cancelOnRequestById(
            String(order._id),
            asAdmin(),
            { refund: false },
            testCallerContext
        );

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: ordersAuditActions.ORDER_CANCELLED,
                metadata: { cause: 'operator', refund: false, paid: false }
            })
        );
        const rows = await timelineOf(String(order._id), 'cancelled');
        expect(rows.map(({ data }) => data)).toEqual([{ by: 'admin', refund: false }]);
    });

    it('a customer cancel says the money goes back', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser();
        const order = await seedOrder(user);

        await orderService.cancelOnRequestById(
            String(order._id),
            asUser(user),
            {},
            testCallerContext
        );

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: ordersAuditActions.ORDER_CANCELLED,
                metadata: { cause: 'customer', refund: true, paid: false }
            })
        );
        const rows = await timelineOf(String(order._id), 'cancelled');
        expect(rows.map(({ data }) => data)).toEqual([{ by: 'customer', refund: true }]);
    });

    it('a reservation timing out (no context) is audited as the system, not left silent', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser();
        const order = await seedOrder(user);

        // Mirrors module.ts's RESERVATION_EXPIRED handler: no CallerContext — `afterCancel` builds
        // its own system-actor context regardless of the `authContext` passed here.
        await orderService.cancelOnRequestById(String(order._id), asAdmin());

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: ordersAuditActions.ORDER_CANCELLED,
                outcome: 'success',
                // The system actor, not admin — `SYSTEM_ACTOR` is its own role now, not an
                // alias for a human admin's, and the audit trail says so.
                actorRole: 'system',
                actorUserId: 'system'
            })
        );
    });

    it('a reservation timing out reports order_reservation_expired, not order_cancelled', async () => {
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);
        const user = await createUser();
        const order = await seedOrder(user);

        // Mirrors module.ts's RESERVATION_EXPIRED handler: the flag, not the missing context, says expiry.
        await orderService.expireReservationById(String(order._id));

        expect(analyticsSpy).toHaveBeenCalledWith(
            expect.objectContaining({ event: ordersAnalyticsEvents.ORDER_RESERVATION_EXPIRED })
        );
        expect(analyticsSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({ event: ordersAnalyticsEvents.ORDER_CANCELLED })
        );
    });
});

describe('cancelOnRequestById — the payment-window-expired email', () => {
    // The mails ride `order.cancelled`: this module's listener must be wired.
    beforeEach(() => {
        registerModules([ordersModule]);
    });

    afterEach(() => {
        resetDomainEvents();
    });

    // A bank transfer nobody sent is answered by `payments`, which owns the transfer's deadline: the
    // order's own cancel stays quiet, and says the hold ran out on the event it announces.
    it('sends no expiry email of its own when a bank_transfer order times out', async () => {
        mockEnqueueEmail.mockClear();
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            paymentMethod: 'bank_transfer'
        });

        // Mirrors module.ts's RESERVATION_EXPIRED handler: the real system actor, no CallerContext,
        // and the flag only that handler sets.
        await orderService.expireReservationById(String(order._id));

        await settleOutboxNudges();
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
        const [row] = await outboxEventModel.find({ name: ORDER_CANCELLED }).lean();
        expect(row.payload).toEqual({
            orderId: String(order._id),
            refund: true,
            cause: 'reservation_expired'
        });
    });

    /*
     * A card hold's expiry mails the buyer: thirty minutes is long enough to abandon a checkout
     * tab and wonder later where the order went, so silence is not an option.
     */
    it('sends the card-expired email when a card order times out with no context', async () => {
        mockEnqueueEmail.mockClear();
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], { paymentMethod: 'card' });

        await orderService.expireReservationById(String(order._id));

        await settleOutboxNudges();
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        const [envelope, template] = mockEnqueueEmail.mock.calls[0];
        expect(envelope.to).toBe(user.email);
        expect(template).toBe('orders.order-card-expired');
    });

    it("never sends it for the customer's own cancel, even of a bank_transfer order", async () => {
        mockEnqueueEmail.mockClear();
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            paymentMethod: 'bank_transfer'
        });

        await orderService.cancelOnRequestById(
            String(order._id),
            asUser(user),
            {},
            testCallerContext
        );

        // The cancelled notice is the answer to a person's cancel; the expiry one is not.
        await settleOutboxNudges();
        const templates = mockEnqueueEmail.mock.calls.map(([, template]) => template);
        expect(templates).toEqual(['orders.order-cancelled']);
    });

    it('still cancels and sends the expiry notice when the buyer lookup fails', async () => {
        mockEnqueueEmail.mockClear();
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], { paymentMethod: 'card' });
        jest.spyOn(userService, 'getById').mockRejectedValueOnce(new Error('lookup unavailable'));

        // Mirrors module.ts's RESERVATION_EXPIRED handler: admin scope, no CallerContext, and the
        // flag only that handler sets. Before the fix, this `await` threw straight out of
        // `afterCancel` — the cancel itself never committed.
        const result = await orderService.expireReservationById(String(order._id));

        expect(result.success).toBe(true);
        const stored = await orderRepository.findById(String(order._id));
        expect(stored?.status).toBe('cancelled');
        await settleOutboxNudges();
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        const [envelope, template] = mockEnqueueEmail.mock.calls[0];
        expect(envelope.to).toBe(order.email);
        expect(template).toBe('orders.order-card-expired');
    });

    it('does not send the expiry email for a system cancel that is not the reservation sweep', async () => {
        mockEnqueueEmail.mockClear();
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            paymentMethod: 'bank_transfer'
        });

        // A system actor with no context and no reservation flag: not the sweep, so no expiry notice.
        await cancelForErasureById(String(order._id));

        await settleOutboxNudges();
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });
});

/** One cancel, the mails it queued as `[recipient, template]` pairs. */
const mailsFor = async (
    cancel: (orderId: string) => Promise<unknown>,
    extras: Parameters<typeof createOrder>[2] = {}
) => {
    mockEnqueueEmail.mockClear();
    const user = await createUser();
    const product = await createProduct();
    const order = await createOrder(user, [toOrderItem(product, 1)], extras);
    await cancel(String(order._id));
    await settleOutboxNudges();
    return {
        user,
        order,
        mails: mockEnqueueEmail.mock.calls.map(([envelope, template, data]) => ({
            to: envelope.to,
            template,
            data
        }))
    };
};

describe('cancelOnRequestById — the cancelled notice', () => {
    beforeEach(() => {
        registerModules([ordersModule]);
    });

    afterEach(() => {
        resetDomainEvents();
    });

    it('mails the buyer when the customer cancels, saying nothing was charged for an unpaid order', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        mockEnqueueEmail.mockClear();

        await orderService.cancelOnRequestById(
            String(order._id),
            asUser(user),
            {},
            testCallerContext
        );

        await settleOutboxNudges();
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        const [envelope, template, data] = mockEnqueueEmail.mock.calls[0];
        expect(envelope.to).toBe(user.email);
        expect(template).toBe('orders.order-cancelled');
        expect((data as { refundNote: string }).refundNote).toContain('nothing was charged');
    });

    it('says the money is going back when the cancelled order was paid', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.paid
        });
        await markOrderPaidAt(String(order._id), new Date());
        mockEnqueueEmail.mockClear();

        await orderService.cancelOnRequestById(
            String(order._id),
            asUser(user),
            {},
            testCallerContext
        );

        await settleOutboxNudges();
        const [, template, data] = mockEnqueueEmail.mock.calls[0];
        expect(template).toBe('orders.order-cancelled');
        expect((data as { refundNote: string }).refundNote).toContain('returned');
    });

    it('mails the buyer when staff cancel, and says when staff chose not to refund', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.paid
        });
        await markOrderPaidAt(String(order._id), new Date());
        mockEnqueueEmail.mockClear();

        await orderService.cancelOnRequestById(
            String(order._id),
            asAdmin(),
            { refund: false },
            callerContextAs('admin')
        );

        await settleOutboxNudges();
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        const [envelope, template, data] = mockEnqueueEmail.mock.calls[0];
        expect(envelope.to).toBe(user.email);
        expect(template).toBe('orders.order-cancelled');
        expect((data as { refundNote: string }).refundNote).toContain('No refund');
    });

    it('does not mail for a withdrawal — `returns` acknowledges that one itself', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        mockEnqueueEmail.mockClear();

        const result = await orderService.withdrawById(
            String(order._id),
            asUser(user),
            testCallerContext
        );

        expect(result.success).toBe(true);
        await settleOutboxNudges();
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it.each([
        ['an erasure', (orderId: string) => cancelForErasureById(orderId)],
        [
            'a payment mismatch',
            (orderId: string) => orderService.cancelForPaymentMismatchById(orderId)
        ]
    ])('does not mail for the system’s own cancel for %s', async (_cause, cancel) => {
        const { mails, order } = await mailsFor(cancel);

        expect(mails).toEqual([]);
        // Still a cancel: the status moved and the order says the system did it.
        const stored = await orderRepository.findById(String(order._id));
        expect(stored?.status).toBe(OrderStatus.cancelled);
    });

    it('mails nothing when the cancel is refused', async () => {
        const { mails } = await mailsFor(
            (orderId) =>
                orderService.cancelOnRequestById(orderId, asAdmin(), {}, testCallerContext),
            { status: OrderStatus.shipped }
        );

        expect(mails).toEqual([]);
    });
});

describe('withActions — withdraw', () => {
    it('is offered to the buyer, but not to an operator reading the same order', async () => {
        const user = await createUser();
        const order = await seedOrder(user);

        const asBuyer = await orderService.withActions(order, asUser(user));
        const asStaff = await orderService.withActions(order, asAdmin());

        expect(asBuyer.actions?.withdraw).toBe(true);
        expect(asStaff.actions?.withdraw).toBe(false);
    });

    it('carries the deadline once the clock has started, and stops being offered after it', async () => {
        const user = await createUser();
        const product = await createProduct();
        const open = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.delivered
        });
        await setWithdrawUntil(String(open._id), new Date(Date.now() + 60_000));
        const closed = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.delivered
        });
        await setWithdrawUntil(String(closed._id), new Date(Date.now() - 60_000));

        const openBody = await orderService.withActions(
            (await orderRepository.findById(String(open._id)))!,
            asUser(user)
        );
        const closedBody = await orderService.withActions(
            (await orderRepository.findById(String(closed._id)))!,
            asUser(user)
        );

        expect(openBody.actions?.withdraw).toBe(true);
        expect(openBody.actions?.withdrawUntil).toEqual(expect.any(String));
        expect(closedBody.actions?.withdraw).toBe(false);
    });

    it('is never offered on a cancelled order', async () => {
        const user = await createUser();
        const order = await seedOrder(user);
        await orderService.cancelOnRequestById(String(order._id), asUser(user));
        const cancelled = await orderRepository.findById(String(order._id));

        const body = await orderService.withActions(cancelled!, asUser(user));

        expect(body.actions?.withdraw).toBe(false);
    });
});

describe('withActions', () => {
    it('offers a customer the cancel their status allows', async () => {
        const user = await createUser();
        const order = await seedOrder(user);

        const body = await orderService.withActions(order, asUser(user));

        expect(body.actions).toEqual({
            transitions: ['cancelled'],
            cancel: true,
            pay: true,
            recordPayment: false,
            correctAddress: false,
            start: false,
            override: [],
            invoice: false,
            withdraw: true
        });
    });

    it('offers an operator nothing on a terminal order', async () => {
        const user = await createUser();
        const order = await seedOrder(user);
        await orderService.cancelOnRequestById(String(order._id), asAdmin());
        const cancelled = await orderRepository.findById(String(order._id));

        const body = await orderService.withActions(cancelled!, asAdmin());

        expect(body.actions).toEqual({
            transitions: [],
            cancel: false,
            pay: false,
            recordPayment: false,
            correctAddress: false,
            start: false,
            override: [],
            invoice: false,
            withdraw: false
        });
    });

    it('never offers `paid` to anyone, because no request may claim `system`', async () => {
        const user = await createUser();
        const order = await seedOrder(user);

        for (const caller of [asUser(user), asAdmin()]) {
            const body = await orderService.withActions(order, caller);
            expect((body.actions as { transitions: string[] }).transitions).not.toContain('paid');
        }
    });

    it("gives the warehouse `start` on a paid order, without `update:Order`'s admin column", async () => {
        // Holds `start:Shipment` but not `update:Order` — `actorOf` alone would read
        // this caller as a plain customer, which must not decide `start`.
        const user = await createUser();
        const order = await seedOrder(user);
        const paid = await orderRepository.updateStatusIfIn(String(order._id), ['pending'], 'paid');

        const body = await orderService.withActions(paid!, asWarehouse());

        expect(body.actions!.start).toBe(true);
        expect(body.actions!.override).toEqual([]);
    });

    it("never offers `start` once already `processing` — an echo write isn't a fresh offer", async () => {
        // The regression a raw `canTransition(status, target, 'system')` would reintroduce: that
        // check answers true for a write onto the SAME status (legal for everything but `paid`),
        // which would keep `start` true forever once first reached.
        const user = await createUser();
        const order = await seedOrder(user);
        const processing = await orderRepository.updateStatusIfIn(
            String(order._id),
            ['pending'],
            'processing'
        );

        const body = await orderService.withActions(processing!, asWarehouse());

        expect(body.actions!.start).toBe(false);
    });

    it('withdraws the cancel once anything has shipped, but keeps the withdrawal', async () => {
        const user = await createUser();
        const order = await seedOrder(user);
        await orderRepository.updateStatusIfIn(String(order._id), ['pending'], 'processing');
        const before = await orderService.getById(String(order._id));
        expect(
            await orderService.withActions(before!, asAdmin()).then((one) => one.actions)
        ).toMatchObject({
            cancel: true,
            transitions: ['cancelled']
        });

        // `delivery` reports the first shipment: units remain, so the status stays `processing`.
        const shippedInPart = await orderModel
            .findByIdAndUpdate(
                order._id,
                {
                    fulfillment: {
                        shipped: true,
                        remaining: 1,
                        onHold: 0,
                        awaitingStock: 0,
                        undelivered: 1
                    }
                },
                { returnDocument: 'after' }
            )
            .exec();
        const admin = await orderService.withActions(shippedInPart!, asAdmin());
        const buyer = await orderService.withActions(shippedInPart!, asUser(user));

        expect(admin.status).toBe('processing');
        expect(admin.fulfillmentStatus).toBe('partially_fulfilled');
        expect(admin.actions).toMatchObject({ cancel: false });
        expect(admin.actions!.transitions).not.toContain('cancelled');
        // The buyer's withdrawal still stands: what has not shipped is cancelled through `returns`.
        expect(buyer.actions).toMatchObject({ cancel: false, withdraw: true });
    });

    it('offers an override holder every forward destination, on a customer-only status too', async () => {
        // `admin` holds `override:Order`, which `overridableTargetsFrom` answers from the
        // index-based rule alone — a `paid` order can be overridden straight to any later status.
        const user = await createUser();
        const order = await seedOrder(user);
        const paid = await orderRepository.updateStatusIfIn(String(order._id), ['pending'], 'paid');

        const body = await orderService.withActions(paid!, asAdmin());

        expect(body.actions!.override).toEqual(['processing', 'shipped', 'delivered']);
    });

    it("never offers the warehouse `override:Order`'s destinations", async () => {
        const user = await createUser();
        const order = await seedOrder(user);
        const paid = await orderRepository.updateStatusIfIn(String(order._id), ['pending'], 'paid');

        const body = await orderService.withActions(paid!, asWarehouse());

        expect(body.actions!.override).toEqual([]);
    });

    it('carries the serialized order, not the document', async () => {
        // `actions` rides on the wire shape; set on a document the schema transform would drop it.
        const user = await createUser();
        const order = await seedOrder(user);

        const body = await orderService.withActions(order, asUser(user));

        expect(body.id).toBe(String(order._id));
        expect(body).not.toHaveProperty('_id');
        expect(body.totalPrice).toEqual(expect.any(Number));
    });
});
