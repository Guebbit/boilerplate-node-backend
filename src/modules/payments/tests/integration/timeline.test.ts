/**
 * @module
 * What payments leaves on an order's timeline: the payment that settled and who recorded it, a
 * decline, and each refund's three moments (issued, settled, failed). Rows carry ids, money and
 * closed codes — never the provider's wording — and commit in the same transaction as the fact.
 * Real Mongo, through the services' public door.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem, timelineOf } from '@modules/orders/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { orderService } from '@modules/orders';
import {
    createIntent,
    confirmPayment,
    recordOfflinePayment,
    refundByOrder
} from '@modules/payments/services';
import { recordDecline } from '@modules/payments/services/announce';
import { PaymentProviderError } from '@modules/payments/providers';
import { fakePaymentProvider } from '@scenarios/support/doubles/payments/fake';
import paymentsModule from '@modules/payments/module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asCustomer, asAdmin, testCallerContext, callerContextAs } from '@tests/callers';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule]);
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** A customer who paid 100.00 by card: one product at 50.00, two units. */
const paidOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 50 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    const intent = await createIntent(String(order._id), asCustomer(user.id));
    await confirmPayment(
        String((intent as { data?: { id?: string } }).data?.id),
        'pm_card_visa',
        asCustomer(user.id),
        testCallerContext
    );
    return { user, orderId: String(order._id) };
};

/** Refund `amount` of the order's payment as the operator `admin-1`. */
const refund = (orderId: string, amount: number) =>
    refundByOrder(orderId, asAdmin(), callerContextAs('admin', 'admin-1'), { amount });

describe('the payment', () => {
    it('writes `paid` with the method the money came by, and no actor for a card', async () => {
        const { orderId } = await paidOrder();

        const [paid] = await timelineOf(orderId);

        expect(paid).toMatchObject({ type: 'paid', data: { method: 'card' } });
        expect(paid).not.toHaveProperty('actor');
    });

    it('names the operator and the real method for money recorded by hand', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10, onHand: 5 });
        const placed = await orderService.create(
            user.id,
            user.email,
            [{ productId: String(product._id), quantity: 1 }],
            callerContextAs('admin')
        );

        await recordOfflinePayment(
            String(placed.data!._id),
            { method: 'cash', reference: 'till-42' },
            callerContextAs('admin', 'cashier-1')
        );

        const rows = await timelineOf(String(placed.data!._id));
        expect(rows.find(({ type }) => type === 'paid')).toMatchObject({
            actor: 'cashier-1',
            data: { method: 'cash' }
        });
    });

    it('writes a decline once, and nothing for one that lost its race', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10, onHand: 5 });
        const placed = await orderService.create(
            user.id,
            user.email,
            [{ productId: String(product._id), quantity: 1 }],
            callerContextAs('admin')
        );
        const orderId = String(placed.data!._id);
        await createIntent(orderId, asCustomer(user.id));

        await recordDecline(orderId, {});
        const again = await recordDecline(orderId, {});

        expect(again).toBeNull();
        const declines = await timelineOf(orderId, 'payment_declined');
        expect(declines).toHaveLength(1);
        expect(declines[0].data).toHaveProperty('paymentId');
    });
});

describe('a refund', () => {
    it('writes its issue and its settlement, with the operator, the money and the reason code', async () => {
        const { orderId } = await paidOrder();

        await refund(orderId, 30);

        const rows = await timelineOf(orderId, 'refund');
        expect(rows).toMatchObject([
            {
                type: 'refund_issued',
                actor: 'admin-1',
                data: { amount: 30, currency: 'EUR', reason: 'goodwill' }
            },
            { type: 'refund_settled', actor: 'admin-1', data: { amount: 30 } }
        ]);
        expect(rows[0].data.refundId).toBe(rows[1].data.refundId);
    });

    it('writes the failure with a closed code and never the provider`s wording', async () => {
        const { orderId } = await paidOrder();
        jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(
            new PaymentProviderError('insufficient_funds', 'raw provider text')
        );

        await expect(refund(orderId, 30)).rejects.toThrow('raw provider text');

        const rows = await timelineOf(orderId, 'refund');
        expect(rows.map(({ type }) => type)).toEqual(['refund_issued', 'refund_failed']);
        expect(rows[1].data).toMatchObject({ failureReason: 'insufficient_funds' });
        expect(JSON.stringify(rows)).not.toContain('raw provider text');
    });

    it('hides the failed attempt from the buyer and shows it to staff', async () => {
        const { user, orderId } = await paidOrder();
        jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(new Error('down'));
        await expect(refund(orderId, 30)).rejects.toThrow('down');

        const buyer = await orderService.readTimeline(orderId, asCustomer(user.id));
        const staff = await orderService.readTimeline(orderId, asAdmin());

        expect(buyer.map(({ type }) => type)).toEqual(['paid', 'refund_issued']);
        expect(staff.map(({ type }) => type)).toEqual(['paid', 'refund_issued', 'refund_failed']);
    });
});
