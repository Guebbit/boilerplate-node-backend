/**
 * @module
 * `orderService.cancelById` — the customer's one order write, and the invariants that make it
 * safe to expose: the status gate and the write are one statement, so no interleaving can cancel
 * a shipped order; the caller's scope rides in the same statement, so "someone else's order" and
 * "no such order" are the same 404; and the refusal reasons map to different statuses (404 vs
 * 409) because a client can act on that difference.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { orderService } from '@modules/orders/services';
import { ORDER_CANCELLED } from '../../events';
import { orderRepository } from '../../repository';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { userService } from '@modules/users';
import { logger } from '@infrastructure/adapters/logger';
import * as auditPort from '@infrastructure/observability/audit';
import * as analyticsPort from '@infrastructure/observability/analytics';
import { ordersAuditActions } from '../../audit';
import { ordersAnalyticsEvents } from '../../analytics';
import { observePort } from '@tests/ports';
import { asCustomer, asAdmin, asModerator, asWarehouse, testCallerContext } from '@tests/callers';
import { SYSTEM_ACTOR } from '@kernel/permissions';

// The queue, not the copy: `mail-copy.test.ts` pins what the email says.
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
jest.mock('@infrastructure/observability/audit', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/audit')>(
        '@infrastructure/observability/audit'
    );
    const emitAuditEvent = jest.fn();
    return {
        __esModule: true,
        ...actual,
        emitAuditEvent,
        // `recordAudit` closes over its own module's real `emitAuditEvent`, immune to the
        // override above — reroute it through the replacement so a spy on `emitAuditEvent` still
        // sees every `recordAudit` call, exactly as it saw every direct one before.
        recordAudit: (
            context: Parameters<typeof actual.recordAudit>[0],
            fields: Parameters<typeof actual.recordAudit>[1]
        ) => {
            if (!context) return;
            emitAuditEvent(actual.buildAuditEvent(context, fields));
        }
    };
});

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

/** A digital-only order — `requiresShipping: false` — for `fulfill`'s own action tests below. */
const seedDigitalOrder = async (user: Awaited<ReturnType<typeof createUser>>) => {
    const product = await createProduct({ requiresShipping: false });
    return createOrder(user, [toOrderItem(product, 1)]);
};

const asUser = (user: { id: string }) => asCustomer(user.id);

describe('cancelById', () => {
    it('cancels a pending order for its owner', async () => {
        const user = await createUser();
        const order = await seedOrder(user);

        const result = await orderService.cancelById(String(order._id), asUser(user));

        expect(result.success).toBe(true);
        const stored = await orderRepository.findById(String(order._id));
        expect(stored?.status).toBe('cancelled');
    });

    it("refuses another user's order with 404 — indistinguishable from absence", async () => {
        const owner = await createUser({ email: 'owner@example.com', username: 'admin' });
        const stranger = await createUser({ email: 'stranger@example.com', username: 'stranger' });
        const order = await seedOrder(owner);

        const result = await orderService.cancelById(String(order._id), asUser(stranger));

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

        const result = await orderService.cancelById(String(order._id), asUser(user));

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

        const result = await orderService.cancelById(String(order._id), asAdmin(admin.id));

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

        const refused = await orderService.cancelById(String(order._id), asUser(owner));
        expect(refused.success).toBe(false);
        expect(refused.status).toBe(409);

        const allowed = await orderService.cancelById(String(order._id), asAdmin());

        expect(allowed.success).toBe(true);
        const stored = await orderRepository.findById(String(order._id));
        expect(stored?.status).toBe('cancelled');
    });

    /**
     * B21: the reservation-sweep expiry (the system actor) must never cancel an order that has
     * already been paid, even when its own deadline check runs just after payment landed —
     * `pending.cancelled` is the ONLY edge the system actor holds, unlike `admin`'s wider one.
     */
    it("the system actor cannot cancel an order that is already paid — closes B21's race", async () => {
        const owner = await createUser({ email: 'owner@example.com', username: 'admin' });
        const order = await seedOrder(owner);
        await orderRepository.updateStatusIfIn(String(order._id), ['pending'], 'paid');

        const refused = await orderService.cancelById(String(order._id), SYSTEM_ACTOR);

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

        const result = await orderService.cancelById(String(order._id), asUser(user));

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });
});

describe('cancelById — who gets their money back', () => {
    /** The cancellation event, captured rather than acted on. */
    const cancellations: { orderId: string; refund: boolean }[] = [];

    beforeEach(() => {
        cancellations.length = 0;
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

        await orderService.cancelById(String(order._id), asUser(user), { refund: false });

        expect(cancellations).toEqual([{ orderId: String(order._id), refund: true }]);
    });

    it('lets an operator cancel without returning the money', async () => {
        const user = await createUser();
        const order = await seedOrder(user);

        await orderService.cancelById(String(order._id), asAdmin(), { refund: false });

        expect(cancellations).toEqual([{ orderId: String(order._id), refund: false }]);
    });

    it('refunds by default when an operator says nothing', async () => {
        const user = await createUser();
        const order = await seedOrder(user);

        await orderService.cancelById(String(order._id), asAdmin());

        expect(cancellations).toEqual([{ orderId: String(order._id), refund: true }]);
    });

    it('lets a moderator cancel without returning the money too', async () => {
        // The bug this pins: `orders.any.update` is held by name, not through the scope
        // wildcard a moderator never holds — asking for the wildcard alone forced a refund
        // this operator had a reason not to make.
        const user = await createUser();
        const order = await seedOrder(user);

        await orderService.cancelById(String(order._id), asModerator(), { refund: false });

        expect(cancellations).toEqual([{ orderId: String(order._id), refund: false }]);
    });

    it('announces the cancellation either way', async () => {
        // The event states a FACT. Suppressing it for a no-refund cancel would make the record of
        // what happened depend on what was compensated.
        const user = await createUser();
        const order = await seedOrder(user);

        await orderService.cancelById(String(order._id), asAdmin(), { refund: false });

        expect(cancellations).toHaveLength(1);
    });
});

describe('cancelById — audit and analytics', () => {
    it('a customer cancel reports order_cancelled, audited as the customer', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);
        const user = await createUser();
        const order = await seedOrder(user);

        await orderService.cancelById(String(order._id), asUser(user), {}, testCallerContext);

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: ordersAuditActions.ORDER_CANCELLED,
                outcome: 'success',
                actor_role: 'anonymous'
            })
        );
        expect(analyticsSpy).toHaveBeenCalledWith(
            expect.objectContaining({ event: ordersAnalyticsEvents.ORDER_CANCELLED })
        );
    });

    it('a reservation timing out (no context) is audited as the system, not left silent', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser();
        const order = await seedOrder(user);

        // Mirrors module.ts's RESERVATION_EXPIRED handler: admin scope, no CallerContext.
        await orderService.cancelById(String(order._id), asAdmin());

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: ordersAuditActions.ORDER_CANCELLED,
                outcome: 'success',
                actor_role: 'admin',
                actor_user_id: 'system'
            })
        );
    });

    it('a reservation timing out reports order_reservation_expired, not order_cancelled', async () => {
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);
        const user = await createUser();
        const order = await seedOrder(user);

        await orderService.cancelById(String(order._id), asAdmin());

        expect(analyticsSpy).toHaveBeenCalledWith(
            expect.objectContaining({ event: ordersAnalyticsEvents.ORDER_RESERVATION_EXPIRED })
        );
        expect(analyticsSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({ event: ordersAnalyticsEvents.ORDER_CANCELLED })
        );
    });
});

describe('cancelById — the payment-window-expired email', () => {
    it('sends the transfer-expired email when a bank_transfer order times out with no context', async () => {
        mockEnqueueEmail.mockClear();
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            paymentMethod: 'bank_transfer'
        });

        // Mirrors module.ts's RESERVATION_EXPIRED handler: the real system actor, no CallerContext,
        // and the flag only that handler sets.
        await orderService.cancelById(String(order._id), SYSTEM_ACTOR, {}, undefined, true);

        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        const [envelope, template] = mockEnqueueEmail.mock.calls[0];
        expect(envelope.to).toBe(user.email);
        expect(template).toBe('orders.order-transfer-expired');
    });

    /*
     * E5's leftover: this used to send nothing at all — "that hold is thirty minutes and nobody
     * has read a confirmation email by then" was the reasoning, but thirty minutes is still long
     * enough to abandon a checkout tab and wonder later where the order went.
     */
    it('sends the card-expired email when a card order times out with no context', async () => {
        mockEnqueueEmail.mockClear();
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], { paymentMethod: 'card' });

        await orderService.cancelById(String(order._id), SYSTEM_ACTOR, {}, undefined, true);

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

        await orderService.cancelById(String(order._id), asUser(user), {}, testCallerContext);

        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('still cancels and sends the expiry notice when the buyer lookup fails', async () => {
        mockEnqueueEmail.mockClear();
        const loggedError = jest.spyOn(logger, 'error').mockImplementation(() => logger);
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            paymentMethod: 'bank_transfer'
        });
        jest.spyOn(userService, 'getById').mockRejectedValueOnce(new Error('lookup unavailable'));

        // Mirrors module.ts's RESERVATION_EXPIRED handler: admin scope, no CallerContext, and the
        // flag only that handler sets. Before the fix, this `await` threw straight out of
        // `afterCancel` — the cancel itself never committed.
        const result = await orderService.cancelById(
            String(order._id),
            asAdmin(),
            {},
            undefined,
            true
        );

        expect(result.success).toBe(true);
        const stored = await orderRepository.findById(String(order._id));
        expect(stored?.status).toBe('cancelled');
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        const [envelope, template] = mockEnqueueEmail.mock.calls[0];
        expect(envelope.to).toBe(order.email);
        expect(template).toBe('orders.order-transfer-expired');
        expect(loggedError).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Buyer lookup failed; mailing the order with the fallback name.',
                orderId: String(order._id)
            })
        );
    });

    it('does not send the expiry email for a system cancel that is not the reservation sweep', async () => {
        mockEnqueueEmail.mockClear();
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            paymentMethod: 'bank_transfer'
        });

        // Same shape `availability.ts` calls with: a system actor, no context, no reservation
        // flag — its own listener sends its own explanation instead.
        await orderService.cancelById(String(order._id), SYSTEM_ACTOR);

        expect(mockEnqueueEmail).not.toHaveBeenCalled();
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
            start: false,
            ship: false,
            deliver: false,
            fulfill: false,
            override: []
        });
    });

    it('offers an operator nothing on a terminal order', async () => {
        const user = await createUser();
        const order = await seedOrder(user);
        await orderService.cancelById(String(order._id), asAdmin());
        const cancelled = await orderRepository.findById(String(order._id));

        const body = await orderService.withActions(cancelled!, asAdmin());

        expect(body.actions).toEqual({
            transitions: [],
            cancel: false,
            pay: false,
            start: false,
            ship: false,
            deliver: false,
            fulfill: false,
            override: []
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

    it("gives the warehouse `start` on a paid order, without `orders.any.update`'s admin column", async () => {
        // Holds `delivery.any.start` but not `orders.any.update` — `actorOf` alone would read
        // this caller as a plain customer, which must not decide `start`/`ship`/`deliver`.
        const user = await createUser();
        const order = await seedOrder(user);
        const paid = await orderRepository.updateStatusIfIn(String(order._id), ['pending'], 'paid');

        const body = await orderService.withActions(paid!, asWarehouse());

        expect(body.actions!.start).toBe(true);
        expect(body.actions!.ship).toBe(false);
        expect(body.actions!.deliver).toBe(false);
        expect(body.actions!.fulfill).toBe(false);
        expect(body.actions!.override).toEqual([]);
    });

    it("never offers `start` once already `processing` — an echo write isn't a fresh offer", async () => {
        // The regression a raw `canTransition(status, target, 'system')` would reintroduce: that
        // check answers true for a write onto the SAME status (legal for everything but `paid`),
        // which would keep `start` (or `ship`/`deliver` below) true forever once first reached.
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

    it('gives the warehouse `ship` once processing, and `deliver` once shipped', async () => {
        const user = await createUser();
        const order = await seedOrder(user);

        const processing = await orderRepository.updateStatusIfIn(
            String(order._id),
            ['pending'],
            'processing'
        );
        const whileProcessing = await orderService.withActions(processing!, asWarehouse());
        expect(whileProcessing.actions!.ship).toBe(true);

        const shipped = await orderRepository.updateStatusIfIn(
            String(order._id),
            ['processing'],
            'shipped'
        );
        const whileShipped = await orderService.withActions(shipped!, asWarehouse());
        expect(whileShipped.actions!.deliver).toBe(true);
        // The same echo regression `start`'s own test guards against: `ship` must not still read
        // true now that the order has actually reached `shipped`.
        expect(whileShipped.actions!.ship).toBe(false);

        const delivered = await orderRepository.updateStatusIfIn(
            String(order._id),
            ['shipped'],
            'delivered'
        );
        const whileDelivered = await orderService.withActions(delivered!, asWarehouse());
        expect(whileDelivered.actions!.deliver).toBe(false);
    });

    /*
     * E16(3): `fulfill` and `ship` are mutually exclusive doors for the same `processing` status —
     * which one a client offers depends entirely on whether the order has anything to ship.
     */
    it('gives the warehouse `fulfill` instead of `ship` for a digital-only order once processing', async () => {
        const user = await createUser();
        const digitalOrder = await seedDigitalOrder(user);
        const physicalOrder = await seedOrder(user);

        const digitalProcessing = await orderRepository.updateStatusIfIn(
            String(digitalOrder._id),
            ['pending'],
            'processing'
        );
        const physicalProcessing = await orderRepository.updateStatusIfIn(
            String(physicalOrder._id),
            ['pending'],
            'processing'
        );

        const digitalBody = await orderService.withActions(digitalProcessing!, asWarehouse());
        const physicalBody = await orderService.withActions(physicalProcessing!, asWarehouse());

        expect(digitalBody.actions!.fulfill).toBe(true);
        expect(digitalBody.actions!.ship).toBe(false);
        expect(physicalBody.actions!.fulfill).toBe(false);
        expect(physicalBody.actions!.ship).toBe(true);
    });

    it('never offers `fulfill` for a digital-only order still `paid` — `start` must run first', async () => {
        const user = await createUser();
        const digitalOrder = await seedDigitalOrder(user);
        const paid = await orderRepository.updateStatusIfIn(
            String(digitalOrder._id),
            ['pending'],
            'paid'
        );

        const body = await orderService.withActions(paid!, asWarehouse());

        expect(body.actions!.fulfill).toBe(false);
    });

    it('offers an override holder every forward destination, on a customer-only status too', async () => {
        // `admin` holds `orders.any.override`, which `overridableTargetsFrom` answers from the
        // index-based rule alone — a `paid` order can be overridden straight to any later status.
        const user = await createUser();
        const order = await seedOrder(user);
        const paid = await orderRepository.updateStatusIfIn(String(order._id), ['pending'], 'paid');

        const body = await orderService.withActions(paid!, asAdmin());

        expect(body.actions!.override).toEqual(['processing', 'shipped', 'delivered']);
    });

    it("never offers the warehouse `orders.any.override`'s destinations", async () => {
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
