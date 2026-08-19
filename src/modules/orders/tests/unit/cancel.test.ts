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
import { orderRepository } from '@modules/orders';

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
