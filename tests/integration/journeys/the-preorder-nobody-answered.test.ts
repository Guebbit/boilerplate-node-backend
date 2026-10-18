/**
 * @module
 * Journey: the preorder nobody answered.
 *
 * A paid order holds a normal line and a preorder line. The normal line ships. The preorder's
 * release date slips by more than a month, the buyer is asked whether to keep waiting, and never
 * answers. Thirty days on, the daily preorder sweep cancels what had not shipped and refunds
 * exactly that, with a credit note and mail, and leaves the shipped line alone.
 *
 * Asserts the chain across modules only; the sweep's own rule has its own tests.
 */
import '@tests/contract';
import {
    GetFulfillmentByOrder200Response,
    ListOrderCreditNotes200Response,
    ListReturns200Response
} from '@api/schemas.zod';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, loginBearer } from '@tests/http';
import { advanceDate, freezeDate } from '@tests/clock';
import { bodyOf } from '@tests/body-of';
import { drain } from '@tests/drain';
import { mailsTo, useOutboxMail } from '@tests/journey-mail';
import {
    newShopper,
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
});

/** A day, in milliseconds. */
const DAY_MS = 86_400_000;

it('cancels and refunds the unanswered preorder, and leaves the shipped line', async () => {
    freezeDate();
    const inStock = await createProduct({ price: 20, onHand: 10 });
    const preorder = await createProduct({
        price: 30,
        onHand: 0,
        releaseDate: new Date(Date.now() + 30 * DAY_MS).toISOString()
    });
    const inStockId = String(inStock._id);
    const preorderId = String(preorder._id);
    const { user: admin } = await authenticateAs('admin');
    const staffBefore = await loginBearer(admin.email);
    await api()
        .put(`/inventory/levels/${preorderId}/backorder-limit`)
        .set('Authorization', staffBefore)
        .send({ backorderLimit: 5 })
        .expect(200);

    // Paid for both lines; the normal one ships, the preorder waits for its date.
    const { bearer, email } = await newShopper();
    const order = await placeOrder(bearer, [
        { productId: inStockId, quantity: 1 },
        { productId: preorderId, quantity: 1 }
    ]);
    await payByCard(bearer, order.id);
    await drain();
    await api()
        .post(`/delivery/order/${order.id}/start`)
        .set('Authorization', staffBefore)
        .expect(200);
    const { fulfillmentOrders } = bodyOf(
        await api().get(`/delivery/order/${order.id}`).set('Authorization', staffBefore),
        GetFulfillmentByOrder200Response
    ).data;
    const normal = fulfillmentOrders.find(({ holdReason }) => holdReason === undefined);
    await api()
        .post(`/delivery/fulfillment-orders/${normal?.id ?? ''}/shipments`)
        .set('Authorization', staffBefore)
        .send({})
        .expect(201);

    // The date slips by 45 days: more than 28, so the buyer is asked, and the mail says so.
    await api()
        .patch(`/products/${preorderId}`)
        .set('Authorization', staffBefore)
        .send({ releaseDate: new Date(Date.now() + 75 * DAY_MS).toISOString() })
        .expect(200);
    await drain();
    expect(mailsTo(email, 'delivery.preorder-delayed')).toHaveLength(1);

    // Thirty-one days with no answer; everybody signs in again.
    advanceDate(31 * DAY_MS);
    await drain('sweep:preorders');
    const owner = await loginBearer(email);
    const staff = await loginBearer(admin.email);

    // The unshipped preorder was cancelled through a closed `no_answer` return, refunded exactly.
    const [cancellation, ...others] = bodyOf(
        await api().get('/returns').query({ orderId: order.id }).set('Authorization', owner),
        ListReturns200Response
    ).data.items;
    expect(others).toEqual([]);
    expect(cancellation).toMatchObject({
        kind: 'cancellation',
        reason: 'no_answer',
        status: 'closed',
        refundAmount: 30,
        lines: [{ productId: preorderId, quantity: 1 }]
    });
    const payment = await paymentOf(staff, order.id);
    expect(payment.refunds.map(({ amount, status }) => [amount, status])).toEqual([
        [30, 'succeeded']
    ]);
    expect(payment).toMatchObject({ amount: 55, amountRefunded: 30 });
    const creditNotes = bodyOf(
        await api().get(`/orders/${order.id}/credit-notes`).set('Authorization', owner),
        ListOrderCreditNotes200Response
    ).data;
    expect(creditNotes.map(({ grandTotal }) => grandTotal)).toEqual([30]);

    // The shipped line is untouched: still shipped, still counted out of stock.
    expect(await orderOf(owner, order.id)).toMatchObject({ status: 'shipped' });
    expect(await stockOf(staff, inStockId)).toEqual({ onHand: 9, reserved: 0 });
    expect(mailsTo(email, 'payments.refund-issued')).toHaveLength(1);
    expect(mailsTo(email, 'delivery.shipment-shipped')).toHaveLength(1);
});
