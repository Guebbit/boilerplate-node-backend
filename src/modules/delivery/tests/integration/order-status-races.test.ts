/**
 * @module
 * Two simultaneous status-change requests on the same order must not both pass a check and
 * both write, with the email already sent for the wrong final state. This is that check, against
 * real contention over HTTP.
 *
 * `delivery`'s ship door is the concrete case the flag describes: it reads the order, decides
 * whether to notify, and writes — steps a naive implementation could interleave across two
 * concurrent callers. A shipment claims its fulfillment order by revision inside one transaction,
 * and the email only follows a commit that actually landed — this test is that claim under N-way
 * contention rather than a reading of the source. A ship racing a cancel of the whole order is the
 * other half: the summary write is conditional on the order still being fulfillable, and the cancel
 * on nothing having shipped, so exactly one of them wins.
 */
import { randomUUID } from 'node:crypto';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, readOrder, toOrderItem } from '@modules/orders/tests/factories';
import { fulfillmentOrdersOf, shipmentsOf } from '../factories';
import { OrderStatus } from '@types';
import { orderService } from '@modules/orders';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { settleOutboxNudges } from '@kernel/outbox';
import { eventually } from '@tests/eventually';
import { RACE_SIZE, countStatus, expectNoServerErrors, raceN } from '@tests/race';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));

/** Stands in for the mail queue; the cases assert which mail was enqueued. */
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

afterEach(() => jest.restoreAllMocks());

/** The shipment won: the cancel was refused and nothing was canceled. */
const SHIPMENT_WON = {
    ship: 201,
    cancel: 409,
    order: OrderStatus.shipped,
    shipments: 1,
    fulfillmentOrder: 'closed'
};

/** The cancel won: the shipment was refused, and every fulfillment order followed it. */
const CANCEL_WON = {
    ship: 409,
    cancel: 200,
    order: OrderStatus.canceled,
    shipments: 0,
    fulfillmentOrder: 'canceled'
};

describe('two admins racing the same ship door', () => {
    it('ships once: one 201, the rest refused, one email, one shipment', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.processing
        });
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));

        const results = await raceN(RACE_SIZE, () =>
            api()
                .post(`/delivery/fulfillment-orders/${String(fulfillmentOrder._id)}/shipments`)
                .set('Idempotency-Key', randomUUID())
                .set('Authorization', bearer)
                .send({})
        );

        expectNoServerErrors(results);
        // Every loser is told there is nothing left to ship from, not handed a second success.
        expect(countStatus(results, 201) + countStatus(results, 409)).toBe(RACE_SIZE);
        expect(countStatus(results, 201)).toBe(1);

        /**
         * The claim under test: exactly one shipped-parcel email, never one per racer. The mail
         * rides `shipment.shipped`, so wait for the relay and then for any straggler.
         */
        await eventually(() =>
            settleOutboxNudges().then(() => mockEnqueueEmail.mock.calls.length > 0)
        );
        await settleOutboxNudges();
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);

        const stored = await readOrder(String(order._id));
        expect(stored?.status).toBe(OrderStatus.shipped);
        expect(await shipmentsOf(String(order._id))).toHaveLength(1);
    });

    it('never ships more than remains when racers each ask for part of it', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 3)], {
            status: OrderStatus.processing
        });
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
        const line = { productId: String(product._id), quantity: 1 };

        const results = await raceN(RACE_SIZE, () =>
            api()
                .post(`/delivery/fulfillment-orders/${String(fulfillmentOrder._id)}/shipments`)
                .set('Idempotency-Key', randomUUID())
                .set('Authorization', bearer)
                .send({ lines: [line] })
        );

        expectNoServerErrors(results);
        // Three units, one per racer: exactly three win, however the rest interleave.
        expect(countStatus(results, 201)).toBe(3);
        expect(countStatus(results, 201) + countStatus(results, 409)).toBe(RACE_SIZE);
        const shipments = await shipmentsOf(String(order._id));
        const units = shipments.flatMap(({ lines }) => lines).map(({ quantity }) => quantity);
        expect(units.length).toBe(3);
        const stored = await readOrder(String(order._id));
        expect(stored?.status).toBe(OrderStatus.shipped);
    });
});

describe('a ship racing a cancel of the whole order', () => {
    it('lets exactly one win, and leaves nothing half-done', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.processing
        });
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));

        const [ship, cancel] = await Promise.all([
            api()
                .post(`/delivery/fulfillment-orders/${String(fulfillmentOrder._id)}/shipments`)
                .set('Idempotency-Key', randomUUID())
                .set('Authorization', bearer)
                .send({}),
            api()
                .post(`/orders/${String(order._id)}/cancel`)
                .set('Authorization', bearer)
                .send({})
        ]);

        expect(ship.status).toBeLessThan(500);
        expect(cancel.status).toBeLessThan(500);
        // The cancel announces itself; delivery's listener cancels the fulfillment orders after.
        await settleOutboxNudges();
        const stored = await readOrder(String(order._id));
        const shipments = await shipmentsOf(String(order._id));
        const [after] = await fulfillmentOrdersOf(String(order._id));
        const observed = {
            ship: ship.status,
            cancel: cancel.status,
            order: stored?.status,
            shipments: shipments.length,
            fulfillmentOrder: after.status
        };

        // One whole outcome, either way: a hybrid matches neither.
        expect(observed).toEqual(observed.ship === 201 ? SHIPMENT_WON : CANCEL_WON);
    });
});

describe('a first shipment from a paid order that moved away meanwhile', () => {
    it('answers 409 ORDER_NOT_PAID and ships nothing', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.paid
        });
        /**
         * The ship act read the order as `paid`; the conditional `paid → processing` write then
         * finds it elsewhere (another request cancelled it). A race cannot be made to land here on
         * demand, so the orders door answers what it answers once it has lost.
         */
        jest.spyOn(orderService, 'markProcessing').mockResolvedValueOnce(null);
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
        // `paid` has no fulfillment order until one is made; the first shipment is the act under test.
        expect(fulfillmentOrder).toBeDefined();

        const response = await api()
            .post(`/delivery/fulfillment-orders/${String(fulfillmentOrder._id)}/shipments`)
            .set('Idempotency-Key', randomUUID())
            .set('Authorization', bearer)
            .send({});

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('ORDER_NOT_PAID');
        expect(await shipmentsOf(String(order._id))).toEqual([]);
        const stored = await readOrder(String(order._id));
        expect(stored?.status).toBe(OrderStatus.paid);
    });
});
