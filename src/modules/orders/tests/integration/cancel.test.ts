/**
 * @module
 * `orderService.cancelById` — the customer's one order write, and the invariants that make it
 * safe to expose: the status gate and the write are one statement, so no interleaving can cancel
 * a shipped order; the caller's scope rides in the same statement, so "someone else's order" and
 * "no such order" are the same 404; and the refusal reasons map to different statuses (404 vs
 * 409) because a client can act on that difference.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/caller-context';
import { createUser } from '@modules/users/tests/fixtures';
import { createProduct } from '@modules/products/tests/fixtures';
import { createOrder, toOrderItem } from '@modules/orders/tests/fixtures';
import { orderService } from '@modules/orders/service';
import { orderRepository, ORDER_CANCELLED } from '@modules/orders';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import * as auditPort from '@infrastructure/observability/audit';
import * as analyticsPort from '@infrastructure/observability/analytics';
import { ordersAuditActions } from '../../audit';
import { ordersAnalyticsEvents } from '../../analytics';
import { observePort } from '@tests/ports';

/*
 * The audit port is REPLACED, not spied on: `jest.spyOn` cannot redefine the non-configurable
 * getter a CommonJS namespace import exposes, which fails under `jest.config.mutation.js`'s swc
 * transform and inside Stryker's sandbox. See `tests/support/ports.ts` for the full reasoning.
 */
jest.mock('@infrastructure/observability/audit', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/audit'),
    emitAuditEvent: jest.fn()
}));

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

const asUser = (user: { id: string }) => ({ id: user.id, admin: false });

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
        const owner = await createUser({ email: 'owner@example.com', username: 'owner' });
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

    it('an admin cancels an order they do not own', async () => {
        const owner = await createUser({ email: 'owner@example.com', username: 'owner' });
        const admin = await createUser({
            email: 'boss@example.com',
            username: 'boss',
            admin: true
        });
        const order = await seedOrder(owner);

        const result = await orderService.cancelById(String(order._id), {
            id: admin.id,
            admin: true
        });

        expect(result.success).toBe(true);
    });

    /**
     * `processing → cancelled` belongs to `admin` alone, and this is the only path that can run
     * it — `update()` refuses to execute the transition otherwise. Read as `customer` regardless
     * of caller, this edge would silently exist in the table for everyone.
     */
    it('an operator cancels a processing order, which a customer cannot', async () => {
        const owner = await createUser({ email: 'owner@example.com', username: 'owner' });
        const order = await seedOrder(owner);
        await orderRepository.updateStatusIfIn(String(order._id), ['pending'], 'processing');

        const refused = await orderService.cancelById(String(order._id), asUser(owner));
        expect(refused.success).toBe(false);
        expect(refused.status).toBe(409);

        const allowed = await orderService.cancelById(String(order._id), { admin: true });

        expect(allowed.success).toBe(true);
        const stored = await orderRepository.findById(String(order._id));
        expect(stored?.status).toBe('cancelled');
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

        await orderService.cancelById(String(order._id), { admin: true }, { refund: false });

        expect(cancellations).toEqual([{ orderId: String(order._id), refund: false }]);
    });

    it('refunds by default when an operator says nothing', async () => {
        const user = await createUser();
        const order = await seedOrder(user);

        await orderService.cancelById(String(order._id), { admin: true });

        expect(cancellations).toEqual([{ orderId: String(order._id), refund: true }]);
    });

    it('announces the cancellation either way', async () => {
        // The event states a FACT. Suppressing it for a no-refund cancel would make the record of
        // what happened depend on what was compensated.
        const user = await createUser();
        const order = await seedOrder(user);

        await orderService.cancelById(String(order._id), { admin: true }, { refund: false });

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
        await orderService.cancelById(String(order._id), { admin: true });

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

        await orderService.cancelById(String(order._id), { admin: true });

        expect(analyticsSpy).toHaveBeenCalledWith(
            expect.objectContaining({ event: ordersAnalyticsEvents.ORDER_RESERVATION_EXPIRED })
        );
        expect(analyticsSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({ event: ordersAnalyticsEvents.ORDER_CANCELLED })
        );
    });
});

describe('withActions', () => {
    it('offers a customer the cancel their status allows', async () => {
        const user = await createUser();
        const order = await seedOrder(user);

        const body = orderService.withActions(order, asUser(user));

        expect(body.actions).toEqual({ transitions: ['cancelled'], cancel: true, pay: true });
    });

    it('offers an operator nothing on a terminal order', async () => {
        const user = await createUser();
        const order = await seedOrder(user);
        await orderService.cancelById(String(order._id), { admin: true });
        const cancelled = await orderRepository.findById(String(order._id));

        const body = orderService.withActions(cancelled!, { admin: true });

        expect(body.actions).toEqual({ transitions: [], cancel: false, pay: false });
    });

    it('never offers `paid` to anyone, because no request may claim `system`', async () => {
        const user = await createUser();
        const order = await seedOrder(user);

        for (const caller of [asUser(user), { admin: true }])
            expect(
                (orderService.withActions(order, caller).actions as { transitions: string[] })
                    .transitions
            ).not.toContain('paid');
    });

    it('carries the serialized order, not the document', async () => {
        // `actions` rides on the wire shape; set on a document the schema transform would drop it.
        const user = await createUser();
        const order = await seedOrder(user);

        const body = orderService.withActions(order, asUser(user));

        expect(body.id).toBe(String(order._id));
        expect(body).not.toHaveProperty('_id');
        expect(body.totalPrice).toEqual(expect.any(Number));
    });
});
