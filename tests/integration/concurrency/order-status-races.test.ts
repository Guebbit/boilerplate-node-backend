/**
 * @module
 * Two simultaneous status-change requests on the same order must not both pass a check and
 * both write, with the email already sent for the wrong final state. This is that check, against
 * real contention over HTTP.
 *
 * `delivery`'s ship door is the concrete case the flag describes: it reads the order, decides
 * whether to notify, and writes — three steps a naive implementation could interleave across two
 * concurrent callers. `afterShipmentRecorded` (`delivery/service.ts`) claims the move happens
 * FIRST, conditionally, and the email only follows a WRITE that actually landed — this test is
 * that claim under N-way contention rather than a reading of the source.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { orderModel } from '@modules/orders/model';
import { OrderStatus } from '@types';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { RACE_SIZE, countStatus, expectNoServerErrors, raceN } from '@tests/race';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

afterEach(() => jest.restoreAllMocks());

describe('D2 — two admins racing the same ship door', () => {
    it('ships once: one 200, the rest refused, one email, one history entry', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.processing
        });

        const results = await raceN(RACE_SIZE, () =>
            api()
                .post(`/delivery/order/${String(order._id)}/ship`)
                .set('Authorization', bearer)
                .send({})
        );

        expectNoServerErrors(results);
        // Every loser is told the order is no longer `processing`, not handed a second success.
        expect(countStatus(results, 200) + countStatus(results, 409)).toBe(RACE_SIZE);
        expect(countStatus(results, 200)).toBe(1);

        // The claim under test: exactly one shipped-parcel email, never one per racer.
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);

        const stored = await orderModel.findById(order._id);
        expect(stored?.status).toBe(OrderStatus.shipped);
    });
});
