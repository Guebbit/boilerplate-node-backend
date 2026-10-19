/**
 * @module
 * A paid preorder through delivery: the grouping rule reads what the order FROZE (never the
 * catalogue), the fulfillment order waits `on_hold` for stock, and the receipt that allocates stock
 * releases it through the outbox — whole when it covers everything, split when it is short.
 *
 * Real inventory and a real outbox: the point is the seam between the two modules.
 *
 * See: docs/modules/delivery.md#a-short-stock-delivery
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { orderService } from '@modules/orders';
import { productService } from '@modules/products';
import { testCallerContext } from '@tests/callers';
import { inventoryService } from '@modules/inventory';
import { OrderStatus } from '@types';
import { fulfillmentOrdersOf, paidPreorderOrder } from '@modules/delivery/tests/factories';
import { deliveryService } from '@modules/delivery/services';
import deliveryModule from '@modules/delivery/module';
import { settleOutboxNudges } from '@kernel/outbox';
import { markDomainEventsWired, resetDomainEvents } from '@kernel/events';

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    deliveryModule.subscribe();
    markDomainEventsWired();
});

afterEach(() => resetDomainEvents());

const DAY = 86_400_000;

/** A release date `days` away. */
const inDays = (days: number): Date => new Date(Date.now() + days * DAY);

/** Deliver `quantity` units of a product and let the outbox carry what it announces. */
const receiveAndSettle = async (productId: string, quantity: number) => {
    await inventoryService.receive(productId, quantity, undefined, testCallerContext);
    await settleOutboxNudges();
};

describe('grouping a paid preorder', () => {
    it('holds the preorder line for stock, promised the date the buyer saw', async () => {
        const releaseDate = inDays(30);
        const { orderId } = await paidPreorderOrder([{ quantity: 2, releaseDate }]);

        const all = await fulfillmentOrdersOf(orderId);

        expect(all).toHaveLength(1);
        expect(all[0]).toMatchObject({ status: 'on_hold', holdReason: 'awaiting_stock' });
        expect(all[0].agreedAt?.toISOString()).toBe(releaseDate.toISOString());
        expect(all[0].expectedAt?.toISOString()).toBe(releaseDate.toISOString());
        const stored = await orderService.getById(orderId);
        expect(stored?.fulfillment).toMatchObject({ onHold: 2, awaitingStock: 2 });
    });

    it('ignores a release date the catalogue has since passed: the order froze its own', async () => {
        const { orderId, productIds } = await paidPreorderOrder([
            { quantity: 1, releaseDate: inDays(30) }
        ]);
        await productService.updateById(
            productIds[0],
            { releaseDate: new Date(Date.now() - DAY).toISOString() },
            testCallerContext
        );

        const all = await fulfillmentOrdersOf(orderId);

        expect(all[0]).toMatchObject({ status: 'on_hold', holdReason: 'awaiting_stock' });
    });
});

describe('stock arriving for a paid preorder', () => {
    it('releases the whole fulfillment order when the delivery covers it', async () => {
        const { orderId, productIds } = await paidPreorderOrder([
            { quantity: 2, releaseDate: inDays(30) }
        ]);
        await fulfillmentOrdersOf(orderId);

        await receiveAndSettle(productIds[0], 2);

        const all = await fulfillmentOrdersOf(orderId);
        expect(all).toHaveLength(1);
        expect(all[0]).toMatchObject({ status: 'open' });
        expect(all[0].holdReason).toBeUndefined();
        const stored = await orderService.getById(orderId);
        expect(stored?.fulfillment).toMatchObject({ onHold: 0, awaitingStock: 0, remaining: 2 });
    });

    it('splits a short delivery: the arrived units open, the rest keep waiting', async () => {
        const releaseDate = inDays(30);
        const { orderId, productIds } = await paidPreorderOrder([{ quantity: 3, releaseDate }]);
        await fulfillmentOrdersOf(orderId);

        await receiveAndSettle(productIds[0], 2);

        const all = await fulfillmentOrdersOf(orderId);
        expect(all.map(({ number, status }) => [number, status])).toEqual([
            [1, 'on_hold'],
            [2, 'open']
        ]);
        expect(all[0].lines[0]).toMatchObject({ quantity: 1 });
        expect(all[1].lines[0]).toMatchObject({ quantity: 2 });
        // The new order inherits the promise, so the Late view and the notices still know it.
        expect(all[1].agreedAt?.toISOString()).toBe(releaseDate.toISOString());
    });

    it('makes the fulfillment orders first when the paid listener never ran', async () => {
        const { orderId, productIds } = await paidPreorderOrder([
            { quantity: 1, releaseDate: inDays(30) }
        ]);

        await receiveAndSettle(productIds[0], 1);

        const all = await fulfillmentOrdersOf(orderId);
        expect(all).toHaveLength(1);
        expect(all[0].status).toBe('open');
    });

    it('is harmless when the same allocation is announced twice', async () => {
        const { orderId, productIds } = await paidPreorderOrder([
            { quantity: 3, releaseDate: inDays(30) }
        ]);
        await fulfillmentOrdersOf(orderId);
        await receiveAndSettle(productIds[0], 2);

        await deliveryService.releaseAllocated(orderId, productIds[0], 1);
        await deliveryService.releaseAllocated(orderId, productIds[0], 1);

        const all = await fulfillmentOrdersOf(orderId);
        expect(all.map(({ number, status }) => [number, status])).toEqual([
            [1, 'on_hold'],
            [2, 'open']
        ]);
    });

    it('serves the earliest promise first when an order holds the same product for two dates', async () => {
        const user = await createUser({ email: 'two-dates@example.com' });
        const product = await createProduct({ onHand: 0, price: 10 });
        const early = inDays(20);
        const late = inDays(40);
        const [first, second] = [toOrderItem(product, 1), toOrderItem(product, 2)];
        // One product at two promised dates: the same item frozen twice, as two lines can be.
        const order = await createOrder(
            user,
            [
                {
                    ...second,
                    product: { ...second.product, preorder: true, releaseDate: late.toISOString() }
                },
                {
                    ...first,
                    product: { ...first.product, preorder: true, releaseDate: early.toISOString() }
                }
            ],
            { status: OrderStatus.paid }
        );
        const orderId = String(order._id);
        const productId = String(product._id);
        await inventoryService.setBackorderLimit(productId, 3);
        await inventoryService.reserveForOrder(orderId, [
            { productId, quantity: 3, kind: 'backorder' }
        ]);
        await inventoryService.commitForOrder(orderId);
        await fulfillmentOrdersOf(orderId);

        await receiveAndSettle(productId, 1);

        const all = await fulfillmentOrdersOf(orderId);
        const states = all.map(({ agreedAt, status }) => [agreedAt?.toISOString(), status]);
        expect(states).toEqual(
            expect.arrayContaining([
                [early.toISOString(), 'open'],
                [late.toISOString(), 'on_hold']
            ])
        );
    });
});
