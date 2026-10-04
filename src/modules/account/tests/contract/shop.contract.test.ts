/**
 * @module
 * Contract tests for the parts of /account that reach into the shop: the personal-data export's
 * orders and payments, and the address snapshot a checkout carries. Kept apart from the rest of
 * the /account contract so removing the shop takes exactly this file with it.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { requestAndDownloadExport } from '@tests/account-export';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { createIntent } from '@modules/payments';
import { asCustomer } from '@tests/callers';
import type { ResponseSuccess } from '@infrastructure/http/response';
import type { Payment } from '@types';
import { loginWithCookie } from './support';

setupTestDb();

describe('POST /account/export', () => {
    it("returns the caller's own data across collections, and satisfies the contract", async () => {
        const { user, bearer } = await loginWithCookie();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 2)]);
        const intent = await createIntent(String(order._id), asCustomer(user.id));
        const payment = (intent as ResponseSuccess<Payment>).data;

        const response = await requestAndDownloadExport(bearer);

        expect(response.request.status).toBe(202);
        expect(response.status).toBe(200);
        const data = response.data as {
            profile: { email: string };
            orders: { id: string }[];
            payments: { id: string; orderId: string }[];
            cart: unknown[];
            wishlist: unknown[];
            sessions: { id: string; type: string }[];
        };
        expect(data.profile.email).toBe(user.email);
        expect(data.orders.map((each) => each.id)).toContain(String(order._id));
        // `paymentService.findOwnPaymentsForExport` (payments/services/retention.ts) is the only
        // path this hits — nothing else exercises its pagination read, so a broken page-walk (or
        // the whole read swallowed) would only ever surface here.
        expect(data.payments.map((each) => each.id)).toContain(payment.id);
        expect(data.payments.find((each) => each.id === payment.id)?.orderId).toBe(
            String(order._id)
        );
        expect(data.sessions.some((session) => session.type === 'refresh')).toBe(true);
    });

    it("never includes another account's orders", async () => {
        const { bearer } = await loginWithCookie();
        const stranger = await createUser({ email: 'export-stranger@example.com' });
        const product = await createProduct();
        const strangerOrder = await createOrder(stranger, [toOrderItem(product, 1)]);

        const response = await requestAndDownloadExport(bearer);

        const data = response.data as { orders: { id: string }[] };
        expect(data.orders.map((each) => each.id)).not.toContain(String(strangerOrder._id));
    });
});

describe('the address book at checkout', () => {
    const HOME = {
        label: 'home',
        fullName: 'Ada Lovelace',
        street: 'Via Roma 1',
        city: 'Modena',
        zip: '41121',
        country: 'IT'
    };

    it('checkout carries the snapshot the contract declares', async () => {
        const { bearer } = await authenticateAs('user');
        await api().post('/account/addresses').set('Authorization', bearer).send(HOME);
        const product = await createProduct({ onHand: 5 });
        await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 1 });

        await api()
            .put('/cart/shipping-method')
            .set('Authorization', bearer)
            .send({ shippingMethodId: 'standard' });
        const response = await api().post('/cart/checkout').set('Authorization', bearer).send({});

        expect(response.status).toBe(201);
        expect(response.body.data.shippingAddress).toMatchObject({
            fullName: 'Ada Lovelace',
            street: 'Via Roma 1'
        });
        // "Same as shipping" is the default when something ships.
        expect(response.body.data.billingAddress).toMatchObject({
            fullName: 'Ada Lovelace',
            street: 'Via Roma 1'
        });
    });
});
