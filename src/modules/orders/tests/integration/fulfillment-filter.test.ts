/**
 * @module
 * `GET /orders?fulfillmentStatus=` against real Mongo: the filter is built from the same table the
 * serialized value comes from, so every order a value selects reads that value, and no order that
 * reads it is missed. The pure half is in `unit/fulfillment.test.ts`; this proves the conditions
 * mean the same thing to the database.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { OrderStatus } from '@types';
import type { OrderFulfillmentStatus } from '@types';
import { orderService } from '../../services';
import { orderModel } from '../../model';
import type { FulfillmentSummary } from '../../domain';

setupTestDb();

/** How many buyers this file has made, so each gets an email of its own. */
let buyers = 0;

/** An order for a buyer of its own — every order here needs a distinct account. */
const buyerOrder = async (status: OrderStatus) => {
    const user = await createUser({ email: `buyer-${String(++buyers)}@example.com` });
    return createOrder(user, [toOrderItem(await createProduct(), 1)], { status });
};

/** One order with a status and, optionally, the summary `delivery` would have reported. */
const orderWith = async (status: OrderStatus, fulfillment?: Partial<FulfillmentSummary>) => {
    const order = await buyerOrder(status);
    if (fulfillment)
        await orderModel
            .updateOne(
                { _id: order._id },
                {
                    fulfillment: {
                        shipped: false,
                        remaining: 0,
                        onHold: 0,
                        awaitingStock: 0,
                        undelivered: 0,
                        ...fulfillment
                    }
                }
            )
            .exec();
    return String(order._id);
};

/** The ids a listing by `fulfillmentStatus` answers. */
const listed = (fulfillmentStatus: OrderFulfillmentStatus): Promise<string[]> =>
    orderService.search({ fulfillmentStatus }, {}).then(({ items }) => items.map(({ id }) => id));

describe('listing by fulfillmentStatus', () => {
    it('selects each value’s orders and no others', async () => {
        const pending = await orderWith(OrderStatus.pending);
        const paid = await orderWith(OrderStatus.paid, { remaining: 2 });
        const held = await orderWith(OrderStatus.paid, {
            remaining: 1,
            onHold: 1,
            awaitingStock: 1
        });
        const preparing = await orderWith(OrderStatus.processing, { remaining: 2 });
        const part = await orderWith(OrderStatus.processing, {
            shipped: true,
            remaining: 1,
            undelivered: 1
        });
        const shipped = await orderWith(OrderStatus.shipped, { shipped: true, undelivered: 1 });
        const delivered = await orderWith(OrderStatus.delivered, { shipped: true });

        expect(await listed('unfulfilled').then((all) => all.toSorted())).toEqual(
            [pending, paid].toSorted()
        );
        expect(await listed('on_hold')).toEqual([held]);
        expect(await listed('in_progress')).toEqual([preparing]);
        expect(await listed('partially_fulfilled')).toEqual([part]);
        expect(await listed('shipped')).toEqual([shipped]);
        expect(await listed('fulfilled')).toEqual([delivered]);
    });

    it('agrees with the value each listed order serializes with', async () => {
        await orderWith(OrderStatus.processing, { remaining: 2, onHold: 2 });
        await orderWith(OrderStatus.processing, { shipped: true, remaining: 1 });

        const onHold = await orderService.search({ fulfillmentStatus: 'on_hold' }, {});
        const partial = await orderService.search({ fulfillmentStatus: 'partially_fulfilled' }, {});

        expect(onHold.items.map(({ fulfillmentStatus }) => fulfillmentStatus)).toEqual(['on_hold']);
        expect(partial.items.map(({ fulfillmentStatus }) => fulfillmentStatus)).toEqual([
            'partially_fulfilled'
        ]);
    });

    it('narrows the caller’s own scope instead of replacing it', async () => {
        const mine = await buyerOrder(OrderStatus.delivered);
        await buyerOrder(OrderStatus.delivered);

        const page = await orderService.search(
            { fulfillmentStatus: 'fulfilled' },
            { _id: mine._id }
        );

        expect(page.items.map(({ id }) => id)).toEqual([String(mine._id)]);
    });
});
