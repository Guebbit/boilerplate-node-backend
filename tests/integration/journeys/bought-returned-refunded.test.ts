/**
 * @module
 * Journey: bought, returned, refunded, and it all adds up.
 *
 * A shopper signs up, verifies, pays by card and gets the goods. Part of one line goes back, then
 * the last unit. The end state must agree across `orders`, `payments`, `returns`, `invoicing`,
 * `inventory`, `stats`, `audit-logs` and mail: money to the cent, stock back for the returned
 * units only, sequential documents, and each customer mail sent once.
 *
 * A second journey has a staff member buy from the shop they work in and return their own money:
 * the refund goes through, and its audit row says it was their own order.
 *
 * Asserts the chain across modules only. Each module's own rule has its own tests.
 */
import '@tests/contract';
import {
    AddAddress201Response,
    ApproveReturn200Response,
    Checkout201Response,
    ConfirmEmailVerification200Response,
    ConfirmPayment200Response,
    CreatePaymentIntent201Response,
    CreateReturn201Response,
    DeliverShipment200Response,
    GetFulfillmentByOrder200Response,
    GetSalesStats200Response,
    ListAuditEntries200Response,
    ListOrderCreditNotes200Response,
    RefundPaymentByOrder200Response,
    ReceiveReturn200Response,
    ShipFulfillmentOrder201Response,
    Signup201Response,
    StartFulfilment200Response
} from '@api/schemas.zod';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole, loginBearer } from '@tests/http';
import { bodyOf } from '@tests/body-of';
import { checkoutAs } from '@tests/checkout-as';
import { drain } from '@tests/drain';
import { mailsTo, useOutboxMail, waitForMail } from '@tests/journey-mail';
import { invoicingService } from '@modules/invoicing';
import { paymentOf, stockOf } from '@tests/journey-orders';
import { createProduct } from '@modules/products/tests/factories';

setupTestDb();

beforeEach(useOutboxMail);

/** What the shopper signs up with. */
const SHOPPER = {
    email: 'journey.shopper@example.com',
    username: 'journeyshopper',
    password: 'Journey-pass-1!'
};

/** The whole shop's sales figures for 2026, as an admin reads them. */
const salesTotals = async (bearer: string) =>
    bodyOf(
        await api()
            .get('/stats/sales')
            .query({ from: '2026-01-01', to: '2026-12-31' })
            .set('Authorization', bearer),
        GetSalesStats200Response
    ).data.currencies[0].totals;

it('adds up across money, stock, documents, stats, audit and mail', async () => {
    const dogFood = await createProduct({ price: 20, onHand: 10 });
    const toy = await createProduct({ price: 30, onHand: 10 });
    const dogFoodId = String(dogFood._id);
    const toyId = String(toy._id);
    const { bearer: staff } = await authenticateAs('admin');

    // Sign up, prove the address from the mail, sign in.
    bodyOf(
        await api()
            .post('/account/signup')
            .send({ ...SHOPPER, passwordConfirm: SHOPPER.password, termsAccepted: true }),
        Signup201Response
    );
    const verification = await waitForMail(SHOPPER.email, 'account.verify-request');
    bodyOf(
        await api().post('/account/verify-confirm').send({ token: verification.token }),
        ConfirmEmailVerification200Response
    );
    const shopper = await loginBearer(SHOPPER.email, SHOPPER.password);

    // Two lines, one of quantity 2: 2 x 20 + 30 = 70, and standard shipping is 5 under 100.
    const address = bodyOf(
        await api().post('/account/addresses').set('Authorization', shopper).send({
            label: 'home',
            fullName: 'Journey Shopper',
            street: 'Via Roma 1',
            city: 'Modena',
            zip: '41121',
            country: 'IT'
        }),
        AddAddress201Response
    ).data;
    await api()
        .post('/cart')
        .set('Authorization', shopper)
        .send({ productId: dogFoodId, quantity: 2 });
    await api().post('/cart').set('Authorization', shopper).send({ productId: toyId, quantity: 1 });
    await api()
        .put('/cart/shipping-method')
        .set('Authorization', shopper)
        .send({ shippingMethodId: 'standard' });
    const order = bodyOf(
        await checkoutAs(shopper, { addressId: address.id }),
        Checkout201Response
    ).data;
    expect(order).toMatchObject({ totalPrice: 75, shippingCost: 5, status: 'pending' });
    expect(await stockOf(staff, dogFoodId)).toEqual({ onHand: 10, reserved: 2 });

    // Pay by card.
    const intent = bodyOf(
        await api()
            .post('/payments/intent')
            .set('Authorization', shopper)
            .send({ orderId: order.id }),
        CreatePaymentIntent201Response
    ).data;
    const paid = bodyOf(
        await api()
            .post(`/payments/${intent.id}/confirm`)
            .set('Authorization', shopper)
            .send({ paymentMethodRef: 'pm_card_visa' }),
        ConfirmPayment200Response
    ).data;
    expect(paid).toMatchObject({ status: 'succeeded', amount: 75, amountRefunded: 0 });
    await drain();

    // Staff start, ship and deliver the whole order.
    bodyOf(
        await api().post(`/delivery/order/${order.id}/start`).set('Authorization', staff),
        StartFulfilment200Response
    );
    const [fulfillmentOrder] = bodyOf(
        await api().get(`/delivery/order/${order.id}`).set('Authorization', staff),
        GetFulfillmentByOrder200Response
    ).data.fulfillmentOrders;
    const shipment = bodyOf(
        await api()
            .post(`/delivery/fulfillment-orders/${fulfillmentOrder.id}/shipments`)
            .set('Authorization', staff)
            .send({ trackingCode: 'TRK-JOURNEY01' }),
        ShipFulfillmentOrder201Response
    ).data;
    bodyOf(
        await api().post(`/delivery/shipments/${shipment.id}/deliver`).set('Authorization', staff),
        DeliverShipment200Response
    );
    await drain();
    expect(await stockOf(staff, dogFoodId)).toEqual({ onHand: 8, reserved: 0 });
    expect(await stockOf(staff, toyId)).toEqual({ onHand: 9, reserved: 0 });

    /** One withdrawal from the shopper, approved if it needs it, received by staff. */
    const sendBack = async (lines: { productId: string; quantity: number }[]) => {
        const requested = bodyOf(
            await api()
                .post('/returns')
                .set('Authorization', shopper)
                .send({ orderId: order.id, reason: 'withdrawal', lines }),
            CreateReturn201Response
        ).data;
        if (requested.status === 'requested')
            bodyOf(
                await api().post(`/returns/${requested.id}/approve`).set('Authorization', staff),
                ApproveReturn200Response
            );
        const received = bodyOf(
            await api().post(`/returns/${requested.id}/receive`).set('Authorization', staff),
            ReceiveReturn200Response
        ).data;
        await drain();
        return received;
    };

    // Part of a line goes back: the goods only, the shipping stays with the shop.
    const partial = await sendBack([{ productId: dogFoodId, quantity: 1 }]);
    expect(partial).toMatchObject({ status: 'closed', refundAmount: 20 });
    expect(await stockOf(staff, dogFoodId)).toEqual({ onHand: 9, reserved: 0 });
    expect(await stockOf(staff, toyId)).toEqual({ onHand: 9, reserved: 0 });
    const afterPartial = await salesTotals(staff);
    expect(afterPartial).toMatchObject({
        orders: 1,
        unitsOrdered: 3,
        unitsReversed: 1,
        refunds: 20
    });

    // The last unit goes back: the goods and the shipping.
    const last = await sendBack([
        { productId: dogFoodId, quantity: 1 },
        { productId: toyId, quantity: 1 }
    ]);
    expect(last).toMatchObject({ status: 'closed', refundAmount: 55 });
    expect(await stockOf(staff, dogFoodId)).toEqual({ onHand: 10, reserved: 0 });
    expect(await stockOf(staff, toyId)).toEqual({ onHand: 10, reserved: 0 });
    expect(await salesTotals(staff)).toMatchObject({ unitsReversed: 3, refunds: 75 });

    // Money: captured minus refunded is nothing kept, and each refund is what its return said.
    const payment = await paymentOf(staff, order.id);
    expect(payment).toMatchObject({ amount: 75, amountRefunded: 75 });
    expect(payment.refunds.map(({ amount, status }) => [amount, status])).toEqual([
        [20, 'succeeded'],
        [55, 'succeeded']
    ]);

    // Documents: one invoice, and a credit note per refund in the same series, one after the other.
    const invoice = await invoicingService.findInvoiceForOrder(order.id);
    const creditNotes = bodyOf(
        await api().get(`/orders/${order.id}/credit-notes`).set('Authorization', shopper),
        ListOrderCreditNotes200Response
    ).data;
    expect(invoice?.number).toMatch(/^\d{4}-\d{6}$/);
    expect(creditNotes.map(({ number }) => number)).toEqual(['2026-000001', '2026-000002']);
    expect(creditNotes.map(({ grandTotal }) => grandTotal)).toEqual([20, 55]);
    expect(creditNotes.map(({ refundId }) => refundId)).toEqual(
        payment.refunds.map(({ id }) => id)
    );

    // Audit: every staff act is on record, once; the refunds one per return.
    const audit = bodyOf(
        await api().get('/audit').query({ pageSize: 100 }).set('Authorization', staff),
        ListAuditEntries200Response
    ).data.items.map(({ action }) => action);
    const timesOf = (action: string) => audit.filter((one) => one === action).length;
    expect(
        [
            'admin.order.fulfilment_started',
            'admin.order.shipped',
            'admin.order.delivered',
            'admin.return.received',
            'admin.payment.refunded'
        ].map((action) => timesOf(action))
    ).toEqual([1, 1, 1, 2, 2]);

    // Mail: each customer mail once, and the two returns mailed twice each.
    const mailed = (template: string) => mailsTo(SHOPPER.email, template).map((m) => m.subject);
    expect(mailed('account.verify-request')).toHaveLength(1);
    expect(mailed('orders.order-confirm')).toHaveLength(1);
    expect(mailed('payments.payment-received')).toHaveLength(1);
    expect(mailed('delivery.shipment-shipped')).toHaveLength(1);
    expect(mailed('delivery.shipment-delivered')).toHaveLength(1);
    expect(mailed('returns.notice').toSorted()).toEqual([
        'We received your withdrawal',
        'We received your withdrawal',
        'Your return was refunded',
        'Your return was refunded'
    ]);
});

it('records a staff buyer’s refund of their own order as theirs', async () => {
    const product = await createProduct({ price: 20, onHand: 10 });
    const { bearer: admin } = await authenticateAs('admin');
    // A moderator holds `create:Refund`, and is a customer of the shop like everyone else.
    const { bearer: moderator } = await authenticateAsRole('moderator');

    const address = bodyOf(
        await api().post('/account/addresses').set('Authorization', moderator).send({
            label: 'home',
            fullName: 'Staff Buyer',
            street: 'Via Roma 2',
            city: 'Modena',
            zip: '41121',
            country: 'IT'
        }),
        AddAddress201Response
    ).data;
    await api()
        .post('/cart')
        .set('Authorization', moderator)
        .send({ productId: String(product._id), quantity: 1 });
    await api()
        .put('/cart/shipping-method')
        .set('Authorization', moderator)
        .send({ shippingMethodId: 'standard' });
    const order = bodyOf(
        await checkoutAs(moderator, { addressId: address.id }),
        Checkout201Response
    ).data;
    const intent = bodyOf(
        await api()
            .post('/payments/intent')
            .set('Authorization', moderator)
            .send({ orderId: order.id }),
        CreatePaymentIntent201Response
    ).data;
    bodyOf(
        await api()
            .post(`/payments/${intent.id}/confirm`)
            .set('Authorization', moderator)
            .send({ paymentMethodRef: 'pm_card_visa' }),
        ConfirmPayment200Response
    );
    await drain();

    // The moderator returns the money of the order they bought themselves.
    const refunded = bodyOf(
        await api()
            .post(`/payments/order/${order.id}/refund`)
            .set('Authorization', moderator)
            .set('Idempotency-Key', 'journey-own-order-refund')
            .send({}),
        RefundPaymentByOrder200Response
    ).data;
    expect(refunded).toMatchObject({ amount: 25, amountRefunded: 25 });

    // The trail says the order was theirs; a refund of someone else's order carries no such flag.
    const refunds = bodyOf(
        await api().get('/audit').query({ pageSize: 100 }).set('Authorization', admin),
        ListAuditEntries200Response
    ).data.items.filter(({ action }) => action === 'admin.payment.refunded');
    expect(refunds).toHaveLength(1);
    expect(refunds[0].metadata).toMatchObject({ amount: 25, ownOrder: true });
});
