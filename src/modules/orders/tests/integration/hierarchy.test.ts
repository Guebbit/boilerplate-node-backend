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

/** The six action fields the rank rule and the buyer decide, for a caller reading an order. */
const actionsFor = (orderId: string, role: string, callerId: string) =>
    orderService
        .getById(orderId)
        .then((order) => orderService.withActions(order!, asRole(role, callerId)))
        .then(({ actions }) => ({
            cancel: actions?.cancel,
            pay: actions?.pay,
            recordPayment: actions?.recordPayment,
            transitions: actions?.transitions,
            start: actions?.start,
            override: actions?.override
        }));

describe('what an order offers each caller — what a client renders', () => {
    it('offers the buyer a cancel and the payment step on a pending order', async () => {
        const order = await orderOf('customer');
        const buyer = String(order.userId);

        expect(await actionsFor(String(order._id), 'customer', buyer)).toMatchObject({
            cancel: true,
            pay: true,
            transitions: [OrderStatus.cancelled]
        });
    });

    // A warehouse reads every order; reading is not cancelling, and it is nobody's payer either.
    it.each(['warehouse', 'support'])(
        'offers a %s no cancel and no payment on it',
        async (role) => {
            const order = await orderOf('customer');

            const actions = await actionsFor(String(order._id), role, STAFF_ID);

            expect(actions).toMatchObject({ cancel: false, pay: false, transitions: [] });
        }
    );

    it('offers an operator the cancel on a customer’s order, and not on a staff member’s', async () => {
        const customers = await orderOf('customer');
        const staffs = await orderOf('support');

        const [onCustomer, onStaff] = await Promise.all([
            actionsFor(String(customers._id), 'moderator', STAFF_ID),
            actionsFor(String(staffs._id), 'moderator', STAFF_ID)
        ]);

        expect([onCustomer.cancel, onStaff.cancel]).toEqual([true, false]);
        expect(onStaff.transitions).toEqual([]);
        expect(onStaff.override).toEqual([]);
    });

    it('offers the delivery door on a customer’s paid order and not on a staff member’s', async () => {
        const customers = await orderOf('customer', OrderStatus.paid);
        const staffs = await orderOf('support', OrderStatus.paid);

        const [onCustomer, onStaff] = await Promise.all([
            actionsFor(String(customers._id), 'manager', STAFF_ID),
            actionsFor(String(staffs._id), 'manager', STAFF_ID)
        ]);

        expect([onCustomer.start, onStaff.start]).toEqual([true, false]);
    });

    // The operator's "record money by hand" door: pay is the buyer's, this one is not.
    it('offers an admin the offline payment on a customer’s unpaid order, and the buyer none', async () => {
        const order = await orderOf('customer');
        const buyer = String(order.userId);

        const [byAdmin, byBuyer] = await Promise.all([
            actionsFor(String(order._id), 'admin', STAFF_ID),
            actionsFor(String(order._id), 'customer', buyer)
        ]);

        expect([byAdmin.recordPayment, byAdmin.pay]).toEqual([true, false]);
        expect([byBuyer.recordPayment, byBuyer.pay]).toEqual([false, true]);
    });

    // Nobody handles their own money: an administrator's own unpaid order offers them no cash step.
    it('withholds the offline payment from the buyer on their own order, whatever they rank', async () => {
        const order = await orderOf('admin');

        const actions = await actionsFor(String(order._id), 'admin', String(order.userId));

        expect(actions.recordPayment).toBe(false);
    });

    it('withholds the offline payment once the order is paid, from a role without the key and over a higher rank', async () => {
        const paid = await orderOf('customer', OrderStatus.paid);
        const unpaid = await orderOf('unverified');
        const staffs = await orderOf('support');

        const [afterPaid, withoutKey, overHigherRank] = await Promise.all([
            actionsFor(String(paid._id), 'admin', STAFF_ID),
            actionsFor(String(unpaid._id), 'warehouse', STAFF_ID),
            actionsFor(String(staffs._id), 'moderator', STAFF_ID)
        ]);

        expect(afterPaid.recordPayment).toBe(false);
        expect(withoutKey.recordPayment).toBe(false);
        expect(overHigherRank.recordPayment).toBe(false);
    });
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
