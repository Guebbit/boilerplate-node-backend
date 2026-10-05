/**
 * @module
 * A payment holds one provider intent, and the browser is only ever handed a secret for it.
 *
 * `createIntent` resumes the stored intent (the reference is passed to `prepare`), and refuses an
 * adapter that opened a second one instead: the stray is cancelled, the row keeps the first, and
 * the answer is 409. Otherwise the customer would pay an intent no row names, and the webhook
 * would arrive for a reference nobody holds.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { createIntent } from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import { fakePaymentProvider } from '@scenarios/support/doubles/payments/fake';
import { asCustomer } from '@tests/callers';

setupTestDb();

afterEach(() => {
    jest.restoreAllMocks();
});

/** A priced order for a fresh customer, ready to be paid. */
const anOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 25 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    return { user, orderId: String(order._id) };
};

describe('a second ask for the same payment', () => {
    it('resumes the intent the row holds, by handing its reference to the provider', async () => {
        const { user, orderId } = await anOrder();
        const prepare = jest.spyOn(fakePaymentProvider, 'prepare');

        await createIntent(orderId, asCustomer(user.id));
        const stored = await paymentRepository.findByOrderId(orderId);
        await createIntent(orderId, asCustomer(user.id));

        // First ask: nothing stored yet, so nothing to resume. Second: the stored reference.
        expect(prepare.mock.calls[0]?.[2]).toBeFalsy();
        expect(stored?.providerRef).toBeTruthy();
        expect(prepare.mock.calls[1]?.[2]).toBe(stored?.providerRef);
    });

    it('is refused when the provider opened a different intent, which is cancelled', async () => {
        const { user, orderId } = await anOrder();
        let opened = 0;
        jest.spyOn(fakePaymentProvider, 'prepare').mockImplementation(() => {
            opened += 1;
            return Promise.resolve({
                providerRef: `pi_${opened}`,
                clientSecret: `pi_${opened}_secret`
            });
        });
        const cancel = jest.spyOn(fakePaymentProvider, 'cancel').mockResolvedValue(undefined);

        await createIntent(orderId, asCustomer(user.id));
        const second = await createIntent(orderId, asCustomer(user.id));

        expect(second.success).toBe(false);
        expect(!second.success && second.status).toBe(409);
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(cancel).toHaveBeenCalledWith('pi_2', expect.anything());
        const stored = await paymentRepository.findByOrderId(orderId);
        expect(stored?.providerRef).toBe('pi_1');
    });
});
