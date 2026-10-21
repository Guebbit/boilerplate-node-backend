/**
 * @module
 * Money that lands after the order's hold was released but before its cancellation ran. The
 * units are taken again inside the payment's transaction: enough, and the order is paid as
 * usual; short, the order stays `pending`, the payment is refunded, and the late cancel ends it.
 *
 * The provider's side is the fake PSP; the application is told only through the settlement entry
 * points, as for a real late webhook.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { countersOf, createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { settleOutboxNudges } from '@kernel/outbox';
import { orderService } from '@modules/orders';
import { inventoryService } from '@modules/inventory';
import { paymentService } from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import paymentsModule from '@modules/payments/module';
import { fakePaymentProvider } from '@scenarios/support/doubles/payments/fake';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asCustomer, callerContextAs } from '@tests/callers';
import { asReject } from '@tests/response';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule]);
});

afterEach(() => {
    resetDomainEvents();
});

/**
 * A product's counters once the outbox has delivered the cache refresh a late payment announces.
 * @param productId - the product
 */
const levelOf = (productId: string) =>
    settleOutboxNudges()
        .then(() => countersOf(productId))
        .then(({ onHand, reserved }) => ({ onHand, reserved }));

/** The refund records an order's payment holds. */
const refundsOf = (orderId: string) =>
    paymentRepository.findByOrderId(orderId).then((payment) => payment?.refunds ?? []);

/** The order's own status. */
const orderStatusOf = (orderId: string) =>
    orderService.getById(orderId).then((order) => order?.status);

/** An order for one unit of `product` with its hold taken, as checkout leaves it. */
const heldOrderFor = async (
    user: Awaited<ReturnType<typeof createUser>>,
    product: Awaited<ReturnType<typeof createProduct>>,
    extras: Parameters<typeof createOrder>[2] = {}
) => {
    const order = await createOrder(user, [toOrderItem(product, 1)], extras);
    const outcome = await inventoryService.reserveForOrder(String(order._id), [
        { productId: String(product._id), quantity: 1 }
    ]);
    if (!outcome.held) throw new Error('the hold was refused');
    return String(order._id);
};

/**
 * A card order with an open intent whose hold then expired: released, the order still `pending`.
 * @param onHand - the shelf the product started with
 */
const expiredCardOrder = async (onHand: number) => {
    const user = await createUser({ email: 'late-card@example.com' });
    const product = await createProduct({ price: 25, onHand });
    const orderId = await heldOrderFor(user, product);
    await paymentService.createIntent(orderId, asCustomer(user.id));
    const providerRef = await paymentRepository
        .findByOrderId(orderId)
        .then((payment) => String(payment?.providerRef));
    await inventoryService.releaseForOrder(orderId, 'expire');
    return { orderId, product, productId: String(product._id), providerRef };
};

describe('a card payment that lands on a released hold', () => {
    it('takes the units again and pays the order, when the shelf still has them', async () => {
        const { orderId, productId, providerRef } = await expiredCardOrder(5);
        expect(await levelOf(productId)).toEqual({ onHand: 5, reserved: 0 });
        await fakePaymentProvider.confirm(providerRef, 'pm_card_visa');

        await paymentService.applyWebhookSettlement(providerRef);
        await settleOutboxNudges();

        expect(await orderStatusOf(orderId)).toBe('paid');
        expect(await levelOf(productId)).toEqual({ onHand: 5, reserved: 1 });
        expect(await inventoryService.isStockBoundToOrder(orderId)).toBe(true);
        expect(await refundsOf(orderId)).toHaveLength(0);
    });

    it('leaves the order pending and refunds the money, when the units were sold meanwhile', async () => {
        const { orderId, product, productId, providerRef } = await expiredCardOrder(1);
        await heldOrderFor(await createUser({ email: 'stranger@example.com' }), product);
        expect(await levelOf(productId)).toEqual({ onHand: 1, reserved: 1 });
        await fakePaymentProvider.confirm(providerRef, 'pm_card_visa');

        await paymentService.applyWebhookSettlement(providerRef);
        await settleOutboxNudges();

        // Not paid, nothing oversold: the stranger's unit stands and the late hold stays released.
        expect(await orderStatusOf(orderId)).toBe('pending');
        expect(await levelOf(productId)).toEqual({ onHand: 1, reserved: 1 });
        expect(await inventoryService.isHoldReleased(orderId)).toBe(true);
        const payment = await paymentRepository.findByOrderId(orderId);
        expect(payment?.status).toBe('succeeded');
        expect(payment?.refunds).toHaveLength(1);

        // The late cancellation then ends the order, with nothing left to give back.
        await orderService.expireReservationById(orderId);
        await settleOutboxNudges();
        expect(await orderStatusOf(orderId)).toBe('cancelled');
        expect(await levelOf(productId)).toEqual({ onHand: 1, reserved: 1 });
    });

    it('does not keep the units of an order that was cancelled before the money landed', async () => {
        const { orderId, productId, providerRef } = await expiredCardOrder(5);
        await orderService.expireReservationById(orderId);
        await settleOutboxNudges();
        await fakePaymentProvider.confirm(providerRef, 'pm_card_visa');

        await paymentService.applyWebhookSettlement(providerRef);
        await settleOutboxNudges();

        expect(await orderStatusOf(orderId)).toBe('cancelled');
        expect(await levelOf(productId)).toEqual({ onHand: 5, reserved: 0 });
    });
});

describe('a hand-recorded payment that lands on a released hold', () => {
    it('is recorded and owed back by hand, when the units were sold meanwhile', async () => {
        const product = await createProduct({ price: 20, onHand: 1 });
        const orderId = await heldOrderFor(
            await createUser({ email: 'late-transfer@example.com' }),
            product,
            {
                paymentMethod: 'bank_transfer',
                payBy: new Date(Date.now() + 3_600_000).toISOString()
            }
        );
        await paymentService.openTransferPayment(orderId);
        await inventoryService.releaseForOrder(orderId, 'expire');
        await heldOrderFor(await createUser({ email: 'stranger2@example.com' }), product);

        const recorded = await paymentService.recordOfflinePayment(
            orderId,
            { method: 'bank_transfer', reference: 'statement line 7' },
            callerContextAs('admin')
        );

        // The answer says the order could not take the money; the money itself is on record.
        expect(asReject(recorded).status).toBe(409);
        const payment = await paymentRepository.findByOrderId(orderId);
        expect(payment).toMatchObject({ status: 'succeeded', amountRefunded: 20 });
        // A hand-paid refund is returned by an operator off-system: the record stays open.
        expect(payment?.refunds).toHaveLength(1);
        expect(payment?.refunds[0]?.status).not.toBe('succeeded');
        expect(await orderStatusOf(orderId)).toBe('pending');
        expect(await levelOf(String(product._id))).toEqual({ onHand: 1, reserved: 1 });
    });

    it('pays the order when the shelf still has the units', async () => {
        const product = await createProduct({ price: 20, onHand: 5 });
        const orderId = await heldOrderFor(
            await createUser({ email: 'late-transfer-ok@example.com' }),
            product,
            {
                paymentMethod: 'bank_transfer',
                payBy: new Date(Date.now() + 3_600_000).toISOString()
            }
        );
        await paymentService.openTransferPayment(orderId);
        await inventoryService.releaseForOrder(orderId, 'expire');

        const recorded = await paymentService.recordOfflinePayment(
            orderId,
            { method: 'bank_transfer', reference: 'statement line 8' },
            callerContextAs('admin')
        );

        expect(recorded.success).toBe(true);
        expect(await orderStatusOf(orderId)).toBe('paid');
        expect(await inventoryService.isStockBoundToOrder(orderId)).toBe(true);
        expect(await levelOf(String(product._id))).toEqual({ onHand: 5, reserved: 1 });
    });
});
