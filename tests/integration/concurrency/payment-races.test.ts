/**
 * Concurrency: money and stock, across `payments`, `orders` and `inventory`.
 *
 * Every settlement path is written as conditional writes, and `settlePayment`'s docblock claims
 * "a delivery that arrives twice, or races the browser's own call, settles once". These cases are
 * that claim under real contention, over HTTP, against one in-memory Mongo:
 *
 *   P1 — a double-submitted confirm of one intent: one settlement, one stock commit.
 *   P2 — the provider redelivering one webhook event in parallel: applied once.
 *   P3 — the webhook and the browser's confirm arriving together: still one settlement.
 *   P4 — more buyers than units, all checking out at once: never oversold.
 *   P5 — a customer cancelling while the payment settles: the order and the money always agree.
 *
 * What "once" means is counted in the ledger and the event bus, not inferred from status codes:
 * a second commit would leave `onHand` right by accident only if nothing else moved it, while the
 * `commit` movement rows and `PAYMENT_SUCCEEDED` emissions count every time it happened.
 *
 * Hit rate: P1-P4 contend on every run. P5's window (between `markPaid` and the payment write) was
 *   never hit in 3 runs at TEST_RACE_SIZE=20 with the fix reverted; its bug is pinned
 *   deterministically in `src/modules/payments/tests/integration/service.test.ts`.
 */
import type { Response } from 'supertest';
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import { signWebhookPayload, WEBHOOK_SIGNATURE_HEADER } from '@modules/payments/providers';
import { PAYMENT_SUCCEEDED } from '@modules/payments/events';
import { paymentModel } from '@modules/payments/model';
import { stockMovementModel } from '@modules/inventory/model';
import { orderModel } from '@modules/orders/model';
import { onDomainEvent } from '@kernel/events';
import { StockMovementReason } from '@types';
import { RACE_SIZE, countStatus, expectNoServerErrors, raceN } from '@tests/race';

// No real Chromium here: the placed-order email renders an invoice, and the stub would log a
// failed render for every checkout below. Same stand-in the orders contract suite uses.
jest.mock('@infrastructure/adapters/pdf', () => ({
    renderHtmlToPdf: () => Promise.resolve(Buffer.from('pdf'))
}));

setupTestDb();

/** The method the fake provider settles as `succeeded` — see the contract's own description. */
const GOOD_METHOD = 'pm_card_visa';

/** Distinct customers per test — the default factory address would collide on the second one. */
let customerCounter = 0;

/**
 * A fresh, verified customer, logged in.
 *
 * @returns the bearer header value for that customer's session
 */
const loggedInCustomer = async (): Promise<string> => {
    customerCounter += 1;
    const user = await createUser(
        {
            email: `racer-${customerCounter}@example.com`,
            username: `racer-${customerCounter}`,
            verifiedAt: new Date()
        },
        'customer'
    );
    const login = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });
    if (login.status !== 200) throw new Error(`login failed: ${JSON.stringify(login.body)}`);
    return `Bearer ${String(login.body.data.token)}`;
};

/**
 * A checked-out order with a payment intent: units held, nothing sold, nothing paid.
 *
 * Through the real checkout rather than a fixture, so there is a reservation for the settlement
 * to commit — the half of "settles once" a fixture order cannot show.
 *
 * @param productId - what to buy
 * @param quantity - how many
 * @returns the customer's bearer, the order id and the payment id
 */
const orderAwaitingPayment = async (productId: string, quantity: number) => {
    const bearer = await loggedInCustomer();
    await api().post('/cart').set('Authorization', bearer).send({ productId, quantity });
    const checkout = await api().post('/cart/checkout').set('Authorization', bearer);
    if (checkout.status !== 201) throw new Error(`checkout: ${JSON.stringify(checkout.body)}`);
    const orderId = String(checkout.body.data.order.id);

    const intent = await api()
        .post('/payments/intent')
        .set('Authorization', bearer)
        .send({ orderId });
    if (intent.status !== 201) throw new Error(`intent: ${JSON.stringify(intent.body)}`);

    return { bearer, orderId, paymentId: String(intent.body.data.id) };
};

/**
 * The provider's reference for a payment, read off the row — it is deliberately not published.
 *
 * @param paymentId - the payment
 */
const providerRefOf = (paymentId: string) =>
    paymentModel
        .findById(paymentId)
        .lean<{ providerRef?: string }>()
        .exec()
        .then((payment) => String(payment?.providerRef));

/**
 * A signed webhook delivery, the way the provider sends one.
 *
 * @param event - the delivery body
 */
const deliver = (event: Record<string, unknown>) => {
    const body = JSON.stringify(event);
    return api()
        .post('/payments/webhook')
        .set('Content-Type', 'application/json')
        .set(WEBHOOK_SIGNATURE_HEADER, signWebhookPayload(body))
        .send(body);
};

/**
 * How many `commit` movements the ledger holds for an order — one per line per commit.
 *
 * @param orderId - the order the commit references
 */
const commitsFor = (orderId: string) =>
    stockMovementModel.countDocuments({ reference: orderId, reason: StockMovementReason.commit });

/**
 * Counts `PAYMENT_SUCCEEDED` per order for the rest of the test. The listener is added on top of
 * the modules' own, so it observes without changing what they do.
 *
 * @returns a reader for how many times the event fired for one order
 */
const countSucceededEvents = () => {
    const seen: string[] = [];
    onDomainEvent(PAYMENT_SUCCEEDED, ({ orderId }) => {
        seen.push(orderId);
    });
    return (orderId: string) => seen.filter((id) => id === orderId).length;
};

/**
 * Lets fire-and-forget emissions land before counting them.
 */
const settleEvents = () => new Promise((resolve) => setImmediate(resolve));

describe('P1 — the same intent confirmed many times at once', () => {
    it('settles once: one success, one commit, one event, the units sold once', async () => {
        const product = await createProduct({ onHand: 10 });
        const { bearer, orderId, paymentId } = await orderAwaitingPayment(String(product._id), 2);
        const succeededFor = countSucceededEvents();

        const results = await raceN(RACE_SIZE, () =>
            api()
                .post(`/payments/${paymentId}/confirm`)
                .set('Authorization', bearer)
                .send({ paymentMethodRef: GOOD_METHOD })
        );
        await settleEvents();

        expectNoServerErrors(results);
        // Every loser is told the payment is past confirming, not handed a second success.
        expect(countStatus(results, 200) + countStatus(results, 409)).toBe(RACE_SIZE);
        expect(countStatus(results, 200)).toBeGreaterThanOrEqual(1);

        expect(await commitsFor(orderId)).toBe(1);
        expect(succeededFor(orderId)).toBe(1);
        expect(await countersOf(product._id)).toEqual({ onHand: 8, reserved: 0, available: 8 });
        await expect(orderModel.findById(orderId).then((order) => order?.status)).resolves.toBe(
            'paid'
        );
    });
});

describe('P2 — one webhook event redelivered in parallel', () => {
    it('is applied once, and every delivery is still acknowledged', async () => {
        const product = await createProduct({ onHand: 10 });
        const { orderId, paymentId } = await orderAwaitingPayment(String(product._id), 3);
        const providerRef = await providerRefOf(paymentId);
        const succeededFor = countSucceededEvents();

        const results = await raceN(RACE_SIZE, () =>
            deliver({ id: `evt_${paymentId}`, providerRef, status: 'succeeded' })
        );
        await settleEvents();

        expectNoServerErrors(results);
        // A provider reads anything but 2xx as "retry harder" — a duplicate is not a failure.
        expect(countStatus(results, 200)).toBe(RACE_SIZE);

        expect(await commitsFor(orderId)).toBe(1);
        expect(succeededFor(orderId)).toBe(1);
        expect(await countersOf(product._id)).toEqual({ onHand: 7, reserved: 0, available: 7 });
        await expect(
            paymentModel.findById(paymentId).then((payment) => payment?.status)
        ).resolves.toBe('succeeded');
    });
});

describe('P3 — the webhook racing the browser confirm', () => {
    it('settles once whichever path lands first', async () => {
        const product = await createProduct({ onHand: 10 });
        const { bearer, orderId, paymentId } = await orderAwaitingPayment(String(product._id), 1);
        const providerRef = await providerRefOf(paymentId);
        const succeededFor = countSucceededEvents();

        // Half confirms, half distinct webhook events — distinct ids, so the event claim cannot
        // be what saves it; only the conditional settlement writes can.
        const results = await raceN(RACE_SIZE, (index) =>
            index % 2 === 0
                ? api()
                      .post(`/payments/${paymentId}/confirm`)
                      .set('Authorization', bearer)
                      .send({ paymentMethodRef: GOOD_METHOD })
                : deliver({ id: `evt_${paymentId}_${index}`, providerRef, status: 'succeeded' })
        );
        await settleEvents();

        expectNoServerErrors(results);
        expect(await commitsFor(orderId)).toBe(1);
        expect(succeededFor(orderId)).toBe(1);
        expect(await countersOf(product._id)).toEqual({ onHand: 9, reserved: 0, available: 9 });
    });
});

describe('P4 — more buyers than units, all at once', () => {
    it('holds exactly the stock there is, and refuses the rest with the stock code', async () => {
        const units = Math.max(1, Math.floor(RACE_SIZE / 2));
        const product = await createProduct({ onHand: units });
        const buyers = await Promise.all(
            Array.from({ length: RACE_SIZE }, async () => {
                const bearer = await loggedInCustomer();
                await api()
                    .post('/cart')
                    .set('Authorization', bearer)
                    .send({ productId: String(product._id), quantity: 1 });
                return bearer;
            })
        );

        const results = await raceN(RACE_SIZE, (index) =>
            api().post('/cart/checkout').set('Authorization', buyers[index])
        );

        expectNoServerErrors(results);
        expect(countStatus(results, 201)).toBe(units);
        expect(countStatus(results, 409)).toBe(RACE_SIZE - units);
        const refusals = results
            .filter(
                (result): result is PromiseFulfilledResult<Response> =>
                    result.status === 'fulfilled' && result.value.status === 409
            )
            .map((result) => (result.value.body as { errors: { code: string }[] }).errors[0].code);
        expect(new Set(refusals)).toEqual(new Set(['CART_INSUFFICIENT_STOCK']));

        // Every unit held, none twice, none sold yet; and one order per successful checkout.
        expect(await countersOf(product._id)).toEqual({
            onHand: units,
            reserved: units,
            available: 0
        });
        expect(await orderModel.countDocuments({ 'items.product._id': product._id })).toBe(units);
    });
});

describe('P5 — a customer cancelling while the payment settles', () => {
    /*
     * Each order races its own cancel against its own confirm, several orders at once so the
     * interleavings vary. Which side wins is the database's business; what is asserted is that
     * the outcome is one a sequential run could also have produced — never a cancelled order
     * that kept the money, and never a paid order whose payment did not succeed.
     */
    it('never keeps money for a cancelled order, nor marks paid what was not charged', async () => {
        const product = await createProduct({ onHand: RACE_SIZE * 2 });
        const orders = await Promise.all(
            Array.from({ length: RACE_SIZE }, () => orderAwaitingPayment(String(product._id), 1))
        );

        const results = await raceN(RACE_SIZE * 2, (index) => {
            const { bearer, orderId, paymentId } = orders[Math.floor(index / 2)];
            return index % 2 === 0
                ? api().post(`/orders/${orderId}/cancel`).set('Authorization', bearer)
                : api()
                      .post(`/payments/${paymentId}/confirm`)
                      .set('Authorization', bearer)
                      .send({ paymentMethodRef: GOOD_METHOD });
        });
        await settleEvents();

        expectNoServerErrors(results);
        for (const { orderId, paymentId } of orders) {
            const order = await orderModel.findById(orderId);
            const payment = await paymentModel.findById(paymentId);
            if (order?.status === 'cancelled')
                // Never charged, or charged and given back — never charged and kept.
                expect(['requires_confirmation', 'refunded']).toContain(payment?.status);
            else {
                expect(order?.status).toBe('paid');
                expect(payment?.status).toBe('succeeded');
                expect(await commitsFor(orderId)).toBe(1);
            }
        }
    });
});
