/**
 * @module
 * Journey: the provider disagrees.
 *
 * Three short walks that only the fake provider's levers reach: it reports the wrong amount, it
 * refuses a refund, and it settles a payment behind the server's back. Each ends with no money
 * and no stock out of place.
 */
import '@tests/contract';
import {
    CancelOrderById200Response,
    ListAuditEntries200Response,
    SyncPayment200Response
} from '@api/schemas.zod';
import {
    fakePaymentProvider,
    setFakeOutcome,
    setFakeReceipt,
    setFakeRefundFailure
} from '@scenarios/support/doubles/payments/fake';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { advanceDate, freezeDate } from '@tests/clock';
import { bodyOf } from '@tests/body-of';
import { drain } from '@tests/drain';
import { mailsTo, useOutboxMail } from '@tests/journey-mail';
import {
    confirmCard,
    newShopper,
    openIntent,
    orderOf,
    payByCard,
    paymentOf,
    placeOrder,
    stockOf
} from '@tests/journey-orders';
import { createProduct } from '@modules/products/tests/factories';

setupTestDb();

beforeEach(useOutboxMail);

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

/** The provider's name for a payment, which every lever is keyed by. */
const providerRef = (paymentId: string) => `fake_pi_${paymentId}`;

describe('the provider reports the wrong amount', () => {
    it('refuses the settlement, cancels the order and returns what it collected', async () => {
        const product = await createProduct({ price: 20, onHand: 10 });
        const productId = String(product._id);
        const { bearer, email } = await newShopper();
        const { bearer: staff } = await authenticateAs('admin');
        const order = await placeOrder(bearer, [{ productId, quantity: 2 }]);
        const intent = await openIntent(bearer, order.id);
        setFakeReceipt(providerRef(intent.id), { amountReceived: order.totalPrice - 1 });

        const confirm = await confirmCard(bearer, intent.id);
        await drain();

        expect(confirm.status).toBe(409);
        expect(await orderOf(bearer, order.id)).toMatchObject({ status: 'cancelled' });
        const payment = await paymentOf(staff, order.id);
        expect(payment).toMatchObject({
            amount: order.totalPrice - 1,
            amountRefunded: order.totalPrice - 1
        });
        expect(payment.refunds.map(({ status }) => status)).toEqual(['succeeded']);
        expect(await stockOf(staff, productId)).toEqual({ onHand: 10, reserved: 0 });
        expect(mailsTo(email, 'payments.payment-received')).toHaveLength(0);
        const audit = bodyOf(
            await api().get('/audit').query({ pageSize: 100 }).set('Authorization', staff),
            ListAuditEntries200Response
        ).data.items.map(({ action }) => action);
        expect(audit).toContain('payment.amount_mismatch');
    });
});

describe('the provider refuses a refund', () => {
    it('leaves it failed, then the sweep finishes it with the same key and no drift', async () => {
        freezeDate();
        const product = await createProduct({ price: 20, onHand: 10 });
        const productId = String(product._id);
        const { bearer } = await newShopper();
        const { bearer: staff } = await authenticateAs('admin');
        const order = await placeOrder(bearer, [{ productId, quantity: 1 }]);
        const paid = await payByCard(bearer, order.id);
        await drain();
        const ref = providerRef(paid.id);
        const refund = jest.spyOn(fakePaymentProvider, 'refund');
        setFakeRefundFailure(ref, 'provider_unavailable');

        bodyOf(
            await api().post(`/orders/${order.id}/cancel`).set('Authorization', bearer).send({}),
            CancelOrderById200Response
        );
        await drain();

        const stuck = await paymentOf(staff, order.id);
        expect(stuck.refunds.map(({ status }) => status)).toEqual(['failed']);

        // The sweep retries only records older than NODE_PAYMENT_EFFECT_RETRY_MINUTES (1).
        setFakeRefundFailure(ref, undefined);
        advanceDate(61_000);
        await drain('sweep:payment-effects');

        const settled = await paymentOf(staff, order.id);
        expect(settled.refunds.map(({ amount, status }) => [amount, status])).toEqual([
            [order.totalPrice, 'succeeded']
        ]);
        expect(settled.amountRefunded).toBe(order.totalPrice);
        expect(refund).toHaveBeenCalledTimes(2);
        const keys = refund.mock.calls.map((call) => call[2].idempotencyKey);
        expect(keys[0]).toBe(keys[1]);
        expect(await stockOf(staff, productId)).toEqual({ onHand: 10, reserved: 0 });
    });
});

describe('the provider settles a payment behind the server’s back', () => {
    it('is reconciled by a sync: paid once, mailed once', async () => {
        const product = await createProduct({ price: 20, onHand: 10 });
        const productId = String(product._id);
        const { bearer, email } = await newShopper();
        const { bearer: staff } = await authenticateAs('admin');
        const order = await placeOrder(bearer, [{ productId, quantity: 1 }]);
        const intent = await openIntent(bearer, order.id);
        await confirmCard(bearer, intent.id, 'pm_card_authentication_required');
        expect(await orderOf(bearer, order.id)).toMatchObject({ status: 'pending' });

        // The challenge was completed at the provider in another tab; no confirm reached us.
        setFakeOutcome(providerRef(intent.id), { status: 'succeeded', cardLast4: '3155' });
        const synced = bodyOf(
            await api().post(`/payments/${intent.id}/sync`).set('Authorization', bearer),
            SyncPayment200Response
        ).data;
        await drain();

        expect(synced).toMatchObject({ status: 'succeeded', amount: order.totalPrice });
        expect(await orderOf(bearer, order.id)).toMatchObject({ status: 'paid' });
        expect(await paymentOf(staff, order.id)).toMatchObject({ amountRefunded: 0 });
        expect(await stockOf(staff, productId)).toEqual({ onHand: 10, reserved: 1 });
        expect(mailsTo(email, 'payments.payment-received')).toHaveLength(1);
    });
});
