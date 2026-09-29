/**
 * @module
 * A return whose refund the payment provider refuses: the goods are back either way, the refund
 * stays open on the payment carrying the return's id, and the payment sweep completing it is what
 * closes the return — across two modules, so it lives here rather than in either.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { withEnvironment } from '@tests/environment';
import { resetDomainEvents } from '@kernel/events';
import { asAdmin, asCustomer, testCallerContext } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import { createOrder, forceOrderStatus, toOrderItem } from '@modules/orders/tests/factories';
import { OrderStatus } from '@types';
import { inventoryService } from '@modules/inventory';
import paymentsModule from '@modules/payments/module';
import { createIntent, confirmPayment, paymentService } from '@modules/payments';
import { fakePaymentProvider } from '@modules/payments/providers/fake';
import returnsModule from '@modules/returns/module';
import { createReturn, receiveReturn } from '@modules/returns';
import { returnRepository } from '@modules/returns/repository';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule, returnsModule]);
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** Waits for a fire-and-forget listener's write. */
const waitFor = async (check: () => Promise<boolean>): Promise<void> => {
    const startedAt = Date.now();
    while (!(await check())) {
        if (Date.now() - startedAt > 3000) throw new Error('waitFor: timed out');
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
};

/** A paid, delivered order and a withdrawal on it, ready to receive. */
const withdrawnOrder = async () => {
    const user = await createUser({ email: 'refund-retry@example.com' });
    const shirt = await createProduct({ title: 'Shirt', price: 30, onHand: 10 });
    const order = await createOrder(user, [toOrderItem(shirt, 2)]);
    const orderId = String(order._id);
    await inventoryService.reserveForOrder(orderId, [
        { productId: String(shirt._id), quantity: 2 }
    ]);
    const intent = await createIntent(orderId, asCustomer(user.id));
    if (!intent.success) throw new Error('intent refused');
    await confirmPayment(intent.data.id, 'pm_card_visa', asCustomer(user.id), testCallerContext);
    await forceOrderStatus(orderId, OrderStatus.delivered);
    const outcome = await createReturn(
        { orderId, reason: 'withdrawal' },
        asCustomer(user.id),
        testCallerContext
    );
    if (outcome.kind !== 'created') throw new Error('expected a return');
    return { shirt, orderId, returnId: String(outcome.created._id) };
};

describe('a return whose refund the provider refuses', () => {
    it('leaves the return received, and closes it when the sweep completes the refund', () =>
        withEnvironment('NODE_PAYMENT_EFFECT_RETRY_MINUTES', '0', async () => {
            const { shirt, orderId, returnId } = await withdrawnOrder();
            jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(new Error('down'));

            const result = await receiveReturn(returnId, {}, testCallerContext);

            // The goods are back either way — a failed refund does not undo the receipt.
            expect(result.success && result.data.status).toBe('received');
            expect(await countersOf(shirt._id)).toMatchObject({ onHand: 10 });
            const before = await paymentService.getForOrder(orderId, asAdmin());
            expect(before.success && before.data.refunds[0]).toMatchObject({
                status: 'failed',
                returnId
            });

            await paymentService.retryOpenRefunds();

            await waitFor(async () => {
                const stored = await returnRepository.findById(returnId);
                return stored?.status === 'closed';
            });
            const closed = await returnRepository.findById(returnId);
            expect(closed?.closedAt).toBeInstanceOf(Date);
            const after = await paymentService.getForOrder(orderId, asAdmin());
            expect(after.success && after.data.status).toBe('refunded');
        }));
});
