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
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, readOrder, toOrderItem } from '@modules/orders/tests/factories';
import { fulfillmentOrdersOf, shipmentsOf } from '../factories';
import { OrderStatus } from '@types';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { settleOutboxNudges } from '@kernel/outbox';
import { eventually } from '@tests/eventually';
import { RACE_SIZE, countStatus, expectNoServerErrors, raceN } from '@tests/race';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

afterEach(() => jest.restoreAllMocks());

describe('D2 — two admins racing the same ship door', () => {
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
                .set('Authorization', bearer)
                .send({})
        );

        expectNoServerErrors(results);
        // Every loser is told there is nothing left to ship from, not handed a second success.
        expect(countStatus(results, 201) + countStatus(results, 409)).toBe(RACE_SIZE);
        expect(countStatus(results, 201)).toBe(1);

        // The claim under test: exactly one shipped-parcel email, never one per racer. The mail
        // rides `shipment.shipped`, so wait for the relay and then for any straggler.
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
        if (ship.status === 201) {
            // The shipment won: the cancel was refused and nothing was cancelled.
            expect(cancel.status).toBe(409);
            expect(stored?.status).toBe(OrderStatus.shipped);
            expect(shipments).toHaveLength(1);
            expect(after.status).toBe('closed');
        } else {
            // The cancel won: the shipment was refused, and every fulfillment order followed it.
            expect(cancel.status).toBe(200);
            expect(ship.status).toBe(409);
            expect(stored?.status).toBe(OrderStatus.cancelled);
            expect(shipments).toEqual([]);
            expect(after.status).toBe('cancelled');
        }
    });
});
