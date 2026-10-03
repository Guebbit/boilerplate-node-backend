/**
 * @module
 * Who may change which order. Two questions, asked in this order after the route's key:
 *
 * - **the write's own scope** — a warehouse or support account READS every order, and that read
 *   key never lets it cancel one; a customer cancels only their own;
 * - **the rank rule** — an operator handling someone else's order needs the buyer strictly below
 *   them, so a staff member's order is one only an admin handles.
 *
 * Driven through the service, one cell per caller role and buyer role.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { callerContextAs, asRole } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { orderService } from '@modules/orders/services';
import { OrderStatus } from '@types';
import type { ResponseReject } from '@infrastructure/http/response';
import { SYSTEM_ACTOR } from '@kernel/permissions';
import { orderRepository } from '../../repository';

setupTestDb();

/** An id that is a real ObjectId and holds no account — a caller nobody owns anything for. */
const STAFF_ID = '65dc8a99604c307b702b5cc0';

/** An order placed by an account holding `role`, still `pending`. */
const orderOf = async (role: string, status: OrderStatus = OrderStatus.pending) => {
    const buyer = await createUser({ email: `${role}@buyer.test`, username: role }, role);
    const product = await createProduct();

    return createOrder(buyer, [toOrderItem(product, 1)], { status });
};

/** The stored status of an order — a refusal must leave it as it was. */
const statusOf = (id: string) => orderRepository.findById(id).then((order) => order?.status);

/** The refusal's first error code, for a result that must be one. */
const refusalCode = (result: { success: boolean }): string | undefined => {
    expect(result.success).toBe(false);
    return (result as ResponseReject).errors[0]?.code;
};

describe('cancelById — the write’s own scope', () => {
    // A warehouse and a support agent both hold `orders.any.read`: that is a read, not a cancel.
    it.each(['warehouse', 'support'])(
        'refuses a %s a customer’s pending order, which it can read',
        async (role) => {
            const order = await orderOf('customer');

            const result = await orderService.cancelById(
                String(order._id),
                asRole(role, STAFF_ID),
                {},
                callerContextAs(role, STAFF_ID)
            );

            expect(result.success).toBe(false);
            expect(result.status).toBe(404);
            expect(await statusOf(String(order._id))).toBe(OrderStatus.pending);
        }
    );

    it('refuses a warehouse a customer’s PAID order too, and forces no refund', async () => {
        const order = await orderOf('customer', OrderStatus.paid);

        const result = await orderService.cancelById(
            String(order._id),
            asRole('warehouse', STAFF_ID),
            {},
            callerContextAs('warehouse', STAFF_ID)
        );

        expect(result.success).toBe(false);
        expect(await statusOf(String(order._id))).toBe(OrderStatus.paid);
    });

    it('still lets a customer cancel their own order', async () => {
        const buyer = await createUser({ email: 'own@buyer.test', username: 'own' }, 'customer');
        const product = await createProduct();
        const order = await createOrder(buyer, [toOrderItem(product, 1)]);

        const result = await orderService.cancelById(
            String(order._id),
            asRole('customer', buyer.id),
            {},
            callerContextAs('customer', buyer.id)
        );

        expect(result.success).toBe(true);
    });

    it.each(['moderator', 'manager', 'admin'])(
        'lets a %s, holding orders.any.update, cancel a customer’s order',
        async (role) => {
            const order = await orderOf('customer');

            const result = await orderService.cancelById(
                String(order._id),
                asRole(role, STAFF_ID),
                {},
                callerContextAs(role, STAFF_ID)
            );

            expect(result.success).toBe(true);
        }
    );
});

describe('the rank rule on an order', () => {
    // [caller, buyer, expected]
    it.each([
        ['moderator', 'customer', 'allowed'],
        ['admin', 'customer', 'allowed'],
        ['admin', 'moderator', 'allowed'],
        ['moderator', 'support', 'OUTRANKED'],
        ['moderator', 'admin', 'OUTRANKED'],
        ['admin', 'admin', 'OUTRANKED']
    ])('%s cancelling a %s’s order: %s', async (callerRole, buyerRole, expected) => {
        const order = await orderOf(buyerRole);

        const result = await orderService.cancelById(
            String(order._id),
            asRole(callerRole, STAFF_ID),
            {},
            callerContextAs(callerRole, STAFF_ID)
        );

        if (expected === 'allowed') expect(result.success).toBe(true);
        else expect(refusalCode(result)).toBe(expected);
    });

    it('applies to amending, deleting and restoring an order', async () => {
        const order = await orderOf('admin');
        const id = String(order._id);
        const moderator = callerContextAs('moderator', STAFF_ID);

        const results = [
            await orderService.updateById(id, { email: 'taken@over.test' }, moderator),
            await orderService.removeById(id, false, moderator),
            await orderService.removeById(id, true, moderator),
            await orderService.restoreById(id, moderator),
            await orderService.overrideStatus(id, OrderStatus.shipped, 'forced', moderator)
        ];

        expect(results.map((result) => refusalCode(result))).toEqual([
            'OUTRANKED',
            'OUTRANKED',
            'OUTRANKED',
            'OUTRANKED',
            'OUTRANKED'
        ]);
        expect(await orderRepository.findById(id)).toMatchObject({ deletedAt: undefined });
    });

    it('lets an admin handle their own order, which the rule never covers', async () => {
        const buyer = await createUser({ email: 'me@admin.test', username: 'me' }, 'admin');
        const product = await createProduct();
        const order = await createOrder(buyer, [toOrderItem(product, 1)]);

        const result = await orderService.updateById(
            String(order._id),
            { email: 'mine@admin.test' },
            callerContextAs('admin', buyer.id)
        );

        expect(result.success).toBe(true);
    });

    it('never refuses the system actor, whose sweep cancels any order', async () => {
        const order = await orderOf('admin');

        const result = await orderService.cancelById(String(order._id), SYSTEM_ACTOR);

        expect(result.success).toBe(true);
    });

    it('leaves an order whose buyer is gone to any operator', async () => {
        const order = await orderOf('customer');
        await orderRepository.detachUserId(String(order.userId), 30);

        const result = await orderService.updateById(
            String(order._id),
            { email: 'anonymised@over.test' },
            callerContextAs('moderator', STAFF_ID)
        );

        expect(result.success).toBe(true);
    });
});
