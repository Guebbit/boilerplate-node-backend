/**
 * `orderService.cancelById` — the customer's one order write, and the invariants that make it
 * safe to expose:
 *
 *   - the status gate and the write are ONE statement, so no interleaving can cancel a shipped
 *     order;
 *   - the caller's scope rides in the same statement, so "someone else's order" and "no such
 *     order" are the same 404;
 *   - the refusal reasons map to different statuses (404 vs 409) because a client can act on
 *     that difference — refresh the list vs explain the state.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factory';
import { createProduct } from '@modules/products/tests/factory';
import { createOrder, toOrderItem } from '@modules/orders/tests/factory';
import { orderService } from '@modules/orders/service';
import { orderRepository, ORDER_CANCELLED } from '@modules/orders';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';

setupTestDb();

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
