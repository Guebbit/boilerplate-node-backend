/**
 * @module
 * The preorder board's reads, against fulfillment orders in every state they can be in: each filter
 * must return exactly the rows whose own `state` says so (the Mongo condition and `boardStateOf` are
 * written twice, and this is what keeps them one rule), the Late view and the due-soon warning, the
 * product summary adding up, and who may see which row.
 *
 * See: docs/modules/delivery.md#the-preorder-board
 */

import { setupTestDb } from '@tests/setup-test-db';
import { asAdmin, asCustomer, callerContextAs, testCallerContext } from '@tests/callers';
import { inventoryService } from '@modules/inventory';
import { settleOutboxNudges } from '@kernel/outbox';
import { markDomainEventsWired, resetDomainEvents } from '@kernel/events';
import {
    deliverEverything,
    fulfillmentOrdersOf,
    paidBackorderOrder,
    paidPreorderOrder,
    shipEverything
} from '@modules/delivery/tests/factories';
import { deliveryService } from '@modules/delivery/services';
import deliveryModule from '@modules/delivery/module';
import { forceOrderStatus } from '@modules/orders/tests/factories';
import { productService } from '@modules/products';
import { OrderStatus } from '@types';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    deliveryModule.subscribe();
    markDomainEventsWired();
});

afterEach(() => resetDomainEvents());

const DAY = 86_400_000;

/** A date `days` from now. */
const inDays = (days: number): Date => new Date(Date.now() + days * DAY);

/** One paid preorder order of one product, its fulfillment orders made. */
const placed = async (quantity: number, days: number, buyer?: string) => {
    const order = await paidPreorderOrder([{ quantity, releaseDate: inDays(days) }], buyer);
    await fulfillmentOrdersOf(order.orderId);
    return order;
};

/** Receive `quantity` units of a product and let the allocation reach delivery. */
const arrive = async (productId: string, quantity: number) => {
    await inventoryService.receive(productId, quantity, undefined, testCallerContext);
    await settleOutboxNudges();
};

/** Every row the board lists for an admin, with the filters given. */
const board = (
    query: Parameters<typeof deliveryService.listPreorderFulfillmentOrders>[0] = {},
    now?: Date
) =>
    deliveryService.listPreorderFulfillmentOrders(query, asAdmin(), now).then(({ items }) => items);

/** The order ids of some rows, sorted, for comparing sets. */
const orderIdsOf = (rows: readonly { orderId: string }[]) =>
    rows.map(({ orderId }) => orderId).toSorted();

/** One paid preorder, each about to be taken to a different state. */
const everyState = async () => {
    const waiting = await placed(1, 30, 'waiting@example.com');
    const allocated = await placed(1, 30, 'allocated@example.com');
    const shipped = await placed(1, 30, 'shipped@example.com');
    const delivered = await placed(1, 30, 'delivered@example.com');
    const cancelled = await placed(1, 30, 'cancelled@example.com');
    const held = await placed(1, 30, 'held@example.com');
    return { waiting, allocated, shipped, delivered, cancelled, held };
};

describe('every state filter returns exactly the rows that are in that state', () => {
    it('agrees with the state each row reports, for all four', async () => {
        const orders = await everyState();
        await arrive(orders.allocated.productIds[0], 1);
        await arrive(orders.shipped.productIds[0], 1);
        await arrive(orders.delivered.productIds[0], 1);
        await arrive(orders.held.productIds[0], 1);
        await forceOrderStatus(orders.shipped.orderId, OrderStatus.processing);
        await shipEverything(orders.shipped.orderId, { trackingCode: 'TRK-BOARD01' });
        await forceOrderStatus(orders.delivered.orderId, OrderStatus.processing);
        await shipEverything(orders.delivered.orderId, { trackingCode: 'TRK-BOARD02' });
        await deliverEverything(orders.delivered.orderId);
        await deliveryService.cancelAllForOrder(orders.cancelled.orderId);
        const [heldFo] = await fulfillmentOrdersOf(orders.held.orderId);
        await deliveryService.holdFulfillmentOrder(
            String(heldFo._id),
            { reason: 'other' },
            asAdmin(),
            callerContextAs('admin')
        );

        const everyone = await board();
        const states = ['waiting', 'allocated', 'shipped', 'cancelled'] as const;

        expect(everyone).toHaveLength(6);
        for (const state of states) {
            const filtered = await board({ state });
            expect(orderIdsOf(filtered)).toEqual(
                orderIdsOf(everyone.filter((row) => row.state === state))
            );
        }
        // And the four are not all empty: the board really was in every state.
        const present = new Set(everyone.map(({ state }) => state));
        expect([...present].toSorted()).toEqual([...states].toSorted());
    });

    it('calls a shipment that arrived delivered, and one still out only shipped', async () => {
        const out = await placed(1, 30, 'out@example.com');
        const arrived = await placed(1, 30, 'arrived@example.com');
        for (const order of [out, arrived]) {
            await arrive(order.productIds[0], 1);
            await forceOrderStatus(order.orderId, OrderStatus.processing);
            await shipEverything(order.orderId, { trackingCode: 'TRK-BOARD03' });
        }
        await deliverEverything(arrived.orderId);

        const rows = await board({ state: 'shipped' });

        const flags = Object.fromEntries(rows.map((row) => [row.orderId, row.delivered]));
        expect(flags).toEqual({ [out.orderId]: false, [arrived.orderId]: true });
    });
});

describe('the Late view and the due-soon warning', () => {
    it('lists what passed its expected date with units remaining, and nothing else', async () => {
        const dueSoon = await placed(1, 5, 'soon@example.com');
        const farAway = await placed(1, 60, 'far@example.com');
        const passed = await placed(1, 5, 'passed@example.com');
        await arrive(passed.productIds[0], 1);
        const later = inDays(20);

        const late = await board({ late: true }, later);

        // `passed` is allocated and unshipped: late though the sweep would leave it alone.
        expect(orderIdsOf(late)).toEqual(
            orderIdsOf([{ orderId: dueSoon.orderId }, { orderId: passed.orderId }])
        );
        expect(late.every((row) => row.late)).toBe(true);
        expect(await board({ late: true })).toEqual([]);
        expect(farAway.orderId).toBeTruthy();
    });

    it('warns of what is still waiting and expected within the window', async () => {
        const soon = await placed(1, 5, 'soon@example.com');
        await placed(1, 60, 'far@example.com');
        const arrived = await placed(1, 5, 'arrived@example.com');
        await arrive(arrived.productIds[0], 1);

        const warned = await board({ dueWithin: 7 });

        expect(orderIdsOf(warned)).toEqual([soon.orderId]);
    });

    it('reports how far a promise slipped, in whole days', async () => {
        const order = await placed(1, 30, 'slipped@example.com');
        await productService.updateById(
            order.productIds[0],
            { releaseDate: inDays(40).toISOString() },
            testCallerContext
        );
        await settleOutboxNudges();

        const [row] = await board();

        expect(row.slippedDays).toBe(10);
    });
});

describe('the product summary', () => {
    it('counts units, and the states add up to what was paid', async () => {
        const first = await placed(3, 30, 'first@example.com');
        const second = await placed(2, 30, 'second@example.com');
        // The same product cannot be shared by two helper orders, so give the second the first's.
        expect(first.productIds[0]).not.toBe(second.productIds[0]);
        await arrive(first.productIds[0], 2);

        const { items } = await deliveryService.summarizePreorders({}, asAdmin());

        const mine = items.find(({ productId }) => productId === first.productIds[0]);
        expect(mine).toMatchObject({ paid: 3, allocated: 2, waiting: 1, shipped: 0, cancelled: 0 });
        for (const row of items)
            expect(row.waiting + row.allocated + row.shipped + row.cancelled).toBe(row.paid);
    });

    it('counts the late units as a subset of the waiting ones', async () => {
        const order = await placed(2, 5, 'late@example.com');

        const { items } = await deliveryService.summarizePreorders({}, asAdmin(), inDays(7));

        expect(items).toMatchObject([
            { productId: order.productIds[0], paid: 2, waiting: 2, late: 2 }
        ]);
    });
});

describe('who may read which rows', () => {
    it("shows a buyer their own and an admin everyone's, in the list and in the summary", async () => {
        const mine = await placed(1, 30, 'mine@example.com');
        const theirs = await placed(1, 30, 'theirs@example.com');

        const asBuyer = await deliveryService.listPreorderFulfillmentOrders(
            {},
            asCustomer(String(mine.user._id))
        );
        const summaryAsBuyer = await deliveryService.summarizePreorders(
            {},
            asCustomer(String(mine.user._id))
        );
        const asStaff = await deliveryService.listPreorderFulfillmentOrders({}, asAdmin());

        expect(orderIdsOf(asBuyer.items)).toEqual([mine.orderId]);
        expect(summaryAsBuyer.items.map(({ productId }) => productId)).toEqual(mine.productIds);
        expect(orderIdsOf(asStaff.items)).toEqual([mine.orderId, theirs.orderId].toSorted());
    });

    it("shows nobody's rows to a caller with no session", async () => {
        await placed(1, 30);

        const { items } = await deliveryService.listPreorderFulfillmentOrders({}, undefined);

        expect(items).toEqual([]);
    });
});

describe('the cause filter', () => {
    it('tells a preorder wait from a backorder wait, and `any` keeps both', async () => {
        const preorder = await placed(1, 30, 'pre@example.com');
        const backorder = await paidBackorderOrder(
            { quantity: 1, shelf: 0, restockDate: inDays(20) },
            'back@example.com'
        );
        await fulfillmentOrdersOf(backorder.orderId);

        const [pre, back, any] = await Promise.all([
            board({ cause: 'preorder' }),
            board({ cause: 'backorder' }),
            board({ cause: 'any' })
        ]);

        expect(orderIdsOf(pre)).toEqual([preorder.orderId]);
        expect(orderIdsOf(back)).toEqual([backorder.orderId]);
        expect(orderIdsOf(any)).toEqual(orderIdsOf([preorder, backorder]));
    });
});
