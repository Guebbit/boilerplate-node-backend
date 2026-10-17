/**
 * @module
 * Journey: the hold that was never paid.
 *
 * An order claims stock the moment it is placed. If the money never comes, the reservation sweep
 * must give the stock back and tell the shopper. Two variants of the same sweep: a card whose
 * 3-D Secure challenge was abandoned, and a bank transfer nobody sent.
 *
 * Both jump the clock past the hold, so every session is signed in again afterwards.
 */
import '@tests/contract';
import { ListPayments200Response } from '@api/schemas.zod';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, loginBearer } from '@tests/http';
import { advanceDate, freezeDate } from '@tests/clock';
import { bodyOf } from '@tests/body-of';
import { drain } from '@tests/drain';
import { mailsTo, useOutboxMail } from '@tests/journey-mail';
import {
    confirmCard,
    ledgerOf,
    newShopper,
    openIntent,
    orderOf,
    placeOrder,
    stockOf
} from '@tests/journey-orders';
import { createProduct } from '@modules/products/tests/factories';

setupTestDb();

beforeEach(useOutboxMail);

afterEach(() => {
    jest.useRealTimers();
});

/** An hour, in milliseconds. */
const HOUR_MS = 3_600_000;

/** The orders staff are still waiting to be paid by transfer. */
const awaiting = async (staff: string) =>
    bodyOf(
        await api()
            .get('/payments')
            .query({ displayStatus: 'incomplete', method: 'bank_transfer' })
            .set('Authorization', staff),
        ListPayments200Response
    ).data.items.map(({ orderId }) => orderId);

describe('an abandoned 3-D Secure challenge', () => {
    it('is expired by the sweep: stock back, order cancelled, shopper told', async () => {
        freezeDate();
        const product = await createProduct({ price: 20, onHand: 10 });
        const productId = String(product._id);
        const { bearer, email } = await newShopper();
        const { user: admin } = await authenticateAs('admin');
        const order = await placeOrder(bearer, [{ productId, quantity: 2 }]);
        const intent = await openIntent(bearer, order.id);
        await confirmCard(bearer, intent.id, 'pm_card_authentication_required');
        const staffBefore = await loginBearer(admin.email);
        expect(await stockOf(staffBefore, productId)).toEqual({ onHand: 10, reserved: 2 });

        // Past the 15-minute card hold; both access tokens have lapsed with it.
        advanceDate(16 * 60_000);
        await drain('sweep:reservations');

        const owner = await loginBearer(email);
        const staff = await loginBearer(admin.email);
        expect(await orderOf(owner, order.id)).toMatchObject({ status: 'cancelled' });
        expect(await stockOf(staff, productId)).toEqual({ onHand: 10, reserved: 0 });
        expect(await ledgerOf(staff, productId)).toEqual(['expire', 'reserve']);
        expect(mailsTo(email, 'orders.order-card-expired')).toHaveLength(1);
    });
});

describe('a bank transfer nobody sent', () => {
    it('is expired after the transfer hold: off the awaiting list, stock back, shopper told', async () => {
        freezeDate();
        const product = await createProduct({ price: 20, onHand: 10 });
        const productId = String(product._id);
        const { bearer, email } = await newShopper();
        const { user: admin } = await authenticateAs('admin');
        const order = await placeOrder(bearer, [{ productId, quantity: 1 }], {
            paymentMethod: 'bank_transfer'
        });
        await drain();
        expect(await awaiting(await loginBearer(admin.email))).toEqual([order.id]);

        // One hour past the 168 h transfer hold.
        advanceDate(169 * HOUR_MS);
        await drain('sweep:reservations');

        const owner = await loginBearer(email);
        const staff = await loginBearer(admin.email);
        expect(await orderOf(owner, order.id)).toMatchObject({ status: 'cancelled' });
        expect(await awaiting(staff)).toEqual([]);
        expect(await stockOf(staff, productId)).toEqual({ onHand: 10, reserved: 0 });
        expect(await ledgerOf(staff, productId)).toEqual(['expire', 'reserve']);
        expect(mailsTo(email, 'payments.transfer-expired')).toHaveLength(1);
    });
});
