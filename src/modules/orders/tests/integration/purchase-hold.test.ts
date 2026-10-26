/**
 * @module
 * The shop's pause on a buyer's checkout after repeated cancellations, taken from the
 * `order.cancelled` fact: only the buyer's own cancels count, the hold lands once, staff are told
 * once, and a staff lift restarts the count (`docs/modules/orders.md#the-purchase-hold`).
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { asAdmin, asCustomer, callerContextAs } from '@tests/callers';
import {
    emitDomainEvent,
    onDomainEvent,
    resetDomainEvents,
    type DomainEventMap
} from '@kernel/events';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { registerModules } from '@kernel/registry';
import { settleOutboxNudges } from '@kernel/outbox';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { userService } from '@modules/users';
import { withEnvironmentOverrides } from '@tests/environment';
import { OrderStatus } from '@types';
import { DAY_MS } from '@domain-primitives/time';
import { orderService } from '../../services';
import { ORDER_CANCELLED, ORDER_PURCHASE_HOLD_PLACED } from '../../events';
import ordersModule from '../../module';
import { orderRepository } from '../../repository';
import { logger } from '@infrastructure/adapters/logger';

// The queue, not the copy.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => {
    mockEnqueueEmail.mockReset();
    // The buyer mail chains a `.catch` on the queue's promise, like the contact form's.
    mockEnqueueEmail.mockResolvedValue(undefined);
    placedFacts.length = 0;
    onDomainEvent(ORDER_PURCHASE_HOLD_PLACED, (fact) => {
        placedFacts.push(fact);
    });
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** A pending order of the buyer's, cancelled by the buyer; resolves to its id. */
const cancelOneAsBuyer = async (buyer: Awaited<ReturnType<typeof createUser>>) => {
    const product = await createProduct();
    const order = await createOrder(buyer, [toOrderItem(product, 1)]);
    const id = String(order._id);
    await orderService.cancelOnRequestById(id, asCustomer(buyer.id));
    return id;
};

/**
 * A PAID order of the buyer's, cancelled by the buyer: a statutory withdrawal that money reached.
 * Resolves to its id.
 */
const cancelOnePaidAsBuyer = async (buyer: Awaited<ReturnType<typeof createUser>>) => {
    const product = await createProduct();
    const order = await createOrder(buyer, [toOrderItem(product, 1)], {
        status: OrderStatus.paid,
        paidAt: new Date().toISOString()
    });
    const id = String(order._id);
    await orderService.cancelOnRequestById(id, asCustomer(buyer.id));
    return id;
};

/** An unpaid order of the buyer's, withdrawn from through returns before dispatch; its id. */
const withdrawOneUnpaid = async (buyer: Awaited<ReturnType<typeof createUser>>) => {
    const product = await createProduct();
    const order = await createOrder(buyer, [toOrderItem(product, 1)]);
    const id = String(order._id);
    await orderService.withdrawById(id, asCustomer(buyer.id));
    return id;
};

/** An unpaid order whose checkout reservation ran out; its id. */
const letOneExpire = async (buyer: Awaited<ReturnType<typeof createUser>>) => {
    const product = await createProduct();
    const order = await createOrder(buyer, [toOrderItem(product, 1)]);
    const id = String(order._id);
    await orderService.expireReservationById(id);
    return id;
};

/** Whether the account carries the review flag. */
const flaggedAt = (id: string) =>
    userRepository.findById(id).then((user) => user?.purchaseHoldFlaggedAt);

/** What the `order.cancelled` row says for a buyer cancel, as the relay would deliver it. */
const buyerCancelled = (orderId: string) => ({ orderId, refund: true, cause: 'customer' }) as const;

/** The `order.purchase_hold_placed` facts emitted so far: what `notifications` turns into a work notice. */
const placedFacts: DomainEventMap['order.purchase_hold_placed'][] = [];

/** The holds staff were told about so far. */
const staffNotices = () => placedFacts;

/** The stored purchase hold the checkout would read. */
const holdOf = (id: string) => userService.purchaseHoldOf(id);

describe('considerPurchaseHold', () => {
    it('puts no hold on the first two cancels', async () => {
        const buyer = await createUser();

        for (let n = 0; n < 2; n += 1)
            await orderService.considerPurchaseHold(buyerCancelled(await cancelOneAsBuyer(buyer)));

        await expect(holdOf(buyer.id)).resolves.toBeUndefined();
        expect(staffNotices()).toHaveLength(0);
    });

    it('holds the checkout after the third, and announces it once', async () => {
        const buyer = await createUser();

        for (let n = 0; n < 3; n += 1)
            await orderService.considerPurchaseHold(buyerCancelled(await cancelOneAsBuyer(buyer)));

        const hold = await holdOf(buyer.id);
        expect(hold).toMatchObject({ reason: 'repeated_cancellations' });
        expect(hold?.until.getTime()).toBeGreaterThan(Date.now());
        expect(staffNotices()).toHaveLength(1);
    });

    it('does not take a second hold, or announce it twice, when the same cancel is delivered again', async () => {
        const buyer = await createUser();
        const ids = [await cancelOneAsBuyer(buyer), await cancelOneAsBuyer(buyer)];
        const third = await cancelOneAsBuyer(buyer);

        for (const id of [...ids, third, third])
            await orderService.considerPurchaseHold(buyerCancelled(id));

        expect(staffNotices()).toHaveLength(1);
    });

    it("counts only the buyer's own cancels, never staff or the system", async () => {
        const buyer = await createUser();
        const ids = [
            await cancelOneAsBuyer(buyer),
            await cancelOneAsBuyer(buyer),
            await cancelOneAsBuyer(buyer)
        ];

        // The same three orders delivered as a cause that is staff's: nothing for the hold to answer.
        for (const orderId of ids)
            await orderService.considerPurchaseHold({ orderId, refund: true, cause: 'operator' });

        await expect(holdOf(buyer.id)).resolves.toBeUndefined();
        await expect(flaggedAt(buyer.id)).resolves.toBeUndefined();
    });

    it("does not count a cancel staff made on the buyer's behalf", async () => {
        const buyer = await createUser();
        await cancelOneAsBuyer(buyer);
        await cancelOneAsBuyer(buyer);
        const product = await createProduct();
        const order = await createOrder(buyer, [toOrderItem(product, 1)]);
        await orderService.cancelOnRequestById(String(order._id), asAdmin());

        await orderService.considerPurchaseHold({
            orderId: String(order._id),
            refund: true,
            cause: 'operator'
        });

        await expect(holdOf(buyer.id)).resolves.toBeUndefined();
    });

    it('restarts the count after a staff lift, so the same cancels never hold twice', async () => {
        const buyer = await createUser();
        for (let n = 0; n < 3; n += 1)
            await orderService.considerPurchaseHold(buyerCancelled(await cancelOneAsBuyer(buyer)));
        await userService.liftPurchaseHold(buyer.id, callerContextAs('admin'));
        placedFacts.length = 0;

        // One more cancel after the review is one, not four.
        await orderService.considerPurchaseHold(buyerCancelled(await cancelOneAsBuyer(buyer)));

        await expect(holdOf(buyer.id)).resolves.toBeUndefined();
        expect(staffNotices()).toHaveLength(0);
    });

    it('follows the configured limit and window', async () => {
        await withEnvironmentOverrides({ NODE_PURCHASE_HOLD_CANCEL_COUNT: '2' }, async () => {
            const buyer = await createUser();

            for (let n = 0; n < 2; n += 1)
                await orderService.considerPurchaseHold(
                    buyerCancelled(await cancelOneAsBuyer(buyer))
                );

            await expect(holdOf(buyer.id)).resolves.toMatchObject({
                reason: 'repeated_cancellations'
            });
        });
    });

    it('announces the hold with the buyer, the shop and when the pause ends', async () => {
        const buyer = await createUser();

        for (let n = 0; n < 3; n += 1)
            await orderService.considerPurchaseHold(buyerCancelled(await cancelOneAsBuyer(buyer)));

        const hold = await holdOf(buyer.id);
        expect(staffNotices()).toEqual([
            {
                tenantId: DEPLOYMENT_TENANT_ID,
                userId: buyer.id,
                until: hold?.until.toISOString()
            }
        ]);
    });

    it('is wired to order.cancelled by the module', async () => {
        registerModules([ordersModule]);
        const buyer = await createUser();
        const ids = [await cancelOneAsBuyer(buyer), await cancelOneAsBuyer(buyer)];
        const third = await cancelOneAsBuyer(buyer);
        await settleOutboxNudges();

        for (const id of [...ids, third])
            await emitDomainEvent(ORDER_CANCELLED, buyerCancelled(id));

        await expect(holdOf(buyer.id)).resolves.toMatchObject({ reason: 'repeated_cancellations' });
    });

    it("logs a failure and resolves, so the cancel mail and the order's later events are not held back", async () => {
        const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);
        jest.spyOn(orderRepository, 'findById').mockRejectedValueOnce(new Error('db down'));

        await expect(
            orderService.considerPurchaseHold(buyerCancelled('000000000000000000000000'))
        ).resolves.toBeUndefined();

        expect(logged).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'purchase hold check failed' })
        );
    });

    it('does nothing for an order that is gone', async () => {
        await expect(
            orderService.considerPurchaseHold({
                orderId: '000000000000000000000000',
                refund: true,
                cause: 'customer'
            })
        ).resolves.toBeUndefined();
    });
});

describe('the pause counts what bots do', () => {
    it('pauses at the third unpaid order left to expire, the way a hoarding bot leaves them', async () => {
        const buyer = await createUser();

        for (let n = 0; n < 3; n += 1)
            await orderService.considerPurchaseHold({
                orderId: await letOneExpire(buyer),
                refund: false,
                cause: 'reservation_expired'
            });

        await expect(holdOf(buyer.id)).resolves.toMatchObject({ reason: 'repeated_cancellations' });
        expect(staffNotices()).toHaveLength(1);
    });

    it('pauses at the third unpaid withdrawal through returns, the second door of the same act', async () => {
        const buyer = await createUser();

        for (let n = 0; n < 3; n += 1)
            await orderService.considerPurchaseHold({
                orderId: await withdrawOneUnpaid(buyer),
                refund: true,
                cause: 'withdrawal'
            });

        await expect(holdOf(buyer.id)).resolves.toMatchObject({ reason: 'repeated_cancellations' });
    });

    it('counts both doors together', async () => {
        const buyer = await createUser();
        await orderService.considerPurchaseHold(buyerCancelled(await cancelOneAsBuyer(buyer)));
        await orderService.considerPurchaseHold({
            orderId: await withdrawOneUnpaid(buyer),
            refund: true,
            cause: 'withdrawal'
        });
        await orderService.considerPurchaseHold({
            orderId: await letOneExpire(buyer),
            refund: false,
            cause: 'reservation_expired'
        });

        await expect(holdOf(buyer.id)).resolves.toMatchObject({ reason: 'repeated_cancellations' });
    });

    it('flags the account in the same write as the pause', async () => {
        const buyer = await createUser();

        for (let n = 0; n < 3; n += 1)
            await orderService.considerPurchaseHold(buyerCancelled(await cancelOneAsBuyer(buyer)));

        await expect(flaggedAt(buyer.id)).resolves.toBeInstanceOf(Date);
    });
});

describe('the pause never lasts longer than 7 days', () => {
    it('ends within a week even when the window is ninety', async () => {
        await withEnvironmentOverrides({ NODE_PURCHASE_HOLD_WINDOW_DAYS: '90' }, async () => {
            const buyer = await createUser();
            const before = Date.now();

            for (let n = 0; n < 3; n += 1)
                await orderService.considerPurchaseHold(
                    buyerCancelled(await cancelOneAsBuyer(buyer))
                );

            const hold = await holdOf(buyer.id);
            expect(hold?.until.getTime()).toBeGreaterThan(Date.now());
            expect(hold?.until.getTime()).toBeLessThanOrEqual(before + 7 * DAY_MS + 60_000);
        });
    });
});

describe('paid cancellations only flag the account', () => {
    it('flags at the third paid cancel and leaves checkout open, announcing nothing', async () => {
        const buyer = await createUser();

        for (let n = 0; n < 3; n += 1)
            await orderService.considerPurchaseHold(
                buyerCancelled(await cancelOnePaidAsBuyer(buyer))
            );

        await expect(holdOf(buyer.id)).resolves.toBeUndefined();
        await expect(flaggedAt(buyer.id)).resolves.toBeInstanceOf(Date);
        // A flag alone is a statutory withdrawal pattern, not a pause: the users list filter finds it.
        expect(staffNotices()).toHaveLength(0);
    });

    it('flags nothing below the limit', async () => {
        const buyer = await createUser();

        for (let n = 0; n < 2; n += 1)
            await orderService.considerPurchaseHold(
                buyerCancelled(await cancelOnePaidAsBuyer(buyer))
            );

        await expect(flaggedAt(buyer.id)).resolves.toBeUndefined();
        expect(staffNotices()).toHaveLength(0);
    });

    it('counts paid withdrawals through the other door too', async () => {
        const buyer = await createUser();
        const product = await createProduct();

        for (let n = 0; n < 3; n += 1) {
            const order = await createOrder(buyer, [toOrderItem(product, 1)], {
                status: OrderStatus.paid,
                paidAt: new Date().toISOString()
            });
            await orderService.withdrawById(String(order._id), asCustomer(buyer.id));
            await orderService.considerPurchaseHold({
                orderId: String(order._id),
                refund: true,
                cause: 'withdrawal'
            });
        }

        await expect(holdOf(buyer.id)).resolves.toBeUndefined();
        await expect(flaggedAt(buyer.id)).resolves.toBeInstanceOf(Date);
    });

    it('does not mix with the unpaid count: two unpaid and two paid pause and flag nothing', async () => {
        const buyer = await createUser();
        await orderService.considerPurchaseHold(buyerCancelled(await cancelOneAsBuyer(buyer)));
        await orderService.considerPurchaseHold(buyerCancelled(await cancelOneAsBuyer(buyer)));
        await orderService.considerPurchaseHold(buyerCancelled(await cancelOnePaidAsBuyer(buyer)));
        await orderService.considerPurchaseHold(buyerCancelled(await cancelOnePaidAsBuyer(buyer)));

        await expect(holdOf(buyer.id)).resolves.toBeUndefined();
        await expect(flaggedAt(buyer.id)).resolves.toBeUndefined();
    });

    it('counts again from zero after a staff review clears the flag', async () => {
        const buyer = await createUser();
        for (let n = 0; n < 3; n += 1)
            await orderService.considerPurchaseHold(
                buyerCancelled(await cancelOnePaidAsBuyer(buyer))
            );
        await userService.liftPurchaseHold(buyer.id, callerContextAs('admin'));

        await orderService.considerPurchaseHold(buyerCancelled(await cancelOnePaidAsBuyer(buyer)));

        await expect(flaggedAt(buyer.id)).resolves.toBeUndefined();
        expect(staffNotices()).toHaveLength(0);
    });
});
