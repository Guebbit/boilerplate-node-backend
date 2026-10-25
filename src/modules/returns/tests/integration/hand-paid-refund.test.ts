/**
 * @module
 * Refunds on money that was handed over by hand (cash, a transfer): nobody here can tell the money
 * went back, so a received return or a buyer's withdrawal only OPENS the refund. It stays
 * `pending` and owed (`payment.refund_owed_by_hand`) until an operator confirms it with
 * `settleRefundByHand`, and a return waits in `received` for exactly that.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { eventually } from '@tests/eventually';
import { resetDomainEvents } from '@kernel/events';
import { asAdmin, asCustomer, callerContextAs } from '@tests/callers';
import { registerAuditSink, type AuditEntry } from '@infrastructure/observability/audit';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, forceOrderStatus, toOrderItem } from '@modules/orders/tests/factories';
import { carryOrderTo, fulfillmentOrdersOf } from '@modules/delivery/tests/factories';
import { deliveryService } from '@modules/delivery';
import { inventoryService } from '@modules/inventory';
import { OrderStatus } from '@types';
import paymentsModule from '@modules/payments/module';
import { paymentService } from '@modules/payments';
import returnsModule from '../../module';
import { returnService } from '../../services';
import { returnRepository } from '../../repository';

setupTestDb();

/** The audit rows written since the test began. */
let audited: AuditEntry[] = [];

beforeEach(() => {
    registerCheckoutModules([paymentsModule, returnsModule]);
    audited = [];
    registerAuditSink((entry) => audited.push(entry));
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** The `payment.refund_owed_by_hand` rows so far. */
const owedRows = () => audited.filter(({ action }) => action === 'payment.refund_owed_by_hand');

/** A distinct address per customer. */
let customers = 0;

/**
 * Two shirts (30.00) and a mug (10.00), paid in CASH, the units held for real. The caller says how
 * far the order got.
 */
const paidInCash = async () => {
    customers += 1;
    const user = await createUser({ email: `hand-${customers}@example.com` });
    const shirt = await createProduct({ title: 'Shirt', price: 30, onHand: 10 });
    const mug = await createProduct({ title: 'Mug', price: 10, onHand: 10 });
    const order = await createOrder(user, [toOrderItem(shirt, 2), toOrderItem(mug, 1)]);
    const orderId = String(order._id);
    await inventoryService.reserveForOrder(orderId, [
        { productId: String(shirt._id), quantity: 2 },
        { productId: String(mug._id), quantity: 1 }
    ]);
    const recorded = await paymentService.recordOfflinePayment(
        orderId,
        { method: 'cash' },
        callerContextAs('admin')
    );
    if (!recorded.success) throw new Error('offline payment refused');
    return { user, shirt, mug, orderId };
};

/** The payment behind an order, as an operator reads it. */
const paymentOf = async (orderId: string) => {
    const read = await paymentService.getForOrder(orderId, asAdmin());
    if (!read.success) throw new Error('no payment');
    return read.data;
};

describe('a received return on a cash-paid order', () => {
    it('keeps the return received and the refund pending until an operator confirms the cash went back', async () => {
        const fixture = await paidInCash();
        await carryOrderTo(fixture.orderId, 'delivered');
        const created = await returnService.createReturn(
            { orderId: fixture.orderId, reason: 'withdrawal' },
            asCustomer(fixture.user.id),
            callerContextAs('customer', fixture.user.id)
        );
        if (!created.success) throw new Error('expected a return');
        const returnId = String(created.data._id);

        // A warehouse member receives the goods: receiving a parcel is not returning cash.
        const received = await returnService.receiveReturn(
            returnId,
            {},
            callerContextAs('warehouse')
        );

        expect(received.success && received.data.status).toBe('received');
        const payment = await paymentOf(fixture.orderId);
        expect(payment.refunds[0].settledByHand).toBeUndefined();
        expect(payment.refunds).toHaveLength(1);
        expect(payment.refunds[0]).toMatchObject({ status: 'pending', reason: 'return' });
        expect(owedRows()).toHaveLength(1);
        expect(owedRows()[0].metadata).toMatchObject({
            refundId: payment.refunds[0].id,
            reason: 'return'
        });

        const settled = await paymentService.settleRefundByHand(
            payment.id,
            payment.refunds[0].id,
            asAdmin(),
            callerContextAs('admin')
        );

        expect(settled.success).toBe(true);
        // The `payment.refunded` event closes the return, as a provider refund's does.
        await eventually(async () => {
            const stored = await returnRepository.findById(returnId);
            return stored?.status === 'closed';
        });
        expect(owedRows()).toHaveLength(1);
    });
});

describe('a buyer cancelling the unshipped remainder of a cash-paid order', () => {
    it('opens the refund and leaves it pending: the buyer cannot say the cash went back', async () => {
        const fixture = await paidInCash();
        await forceOrderStatus(fixture.orderId, OrderStatus.processing);
        const [fulfillmentOrder] = await fulfillmentOrdersOf(fixture.orderId);
        const shipped = await deliveryService.shipFulfillmentOrder(
            String(fulfillmentOrder._id),
            { lines: [{ productId: String(fixture.shirt._id), quantity: 2 }] },
            asAdmin(),
            callerContextAs('admin')
        );
        if (!shipped.success) throw new Error('ship refused');

        const outcome = await returnService.createReturn(
            {
                orderId: fixture.orderId,
                reason: 'withdrawal',
                kind: 'cancellation',
                fulfillmentOrderId: String(fulfillmentOrder._id)
            },
            asCustomer(fixture.user.id),
            callerContextAs('customer', fixture.user.id)
        );

        expect(outcome.success).toBe(true);
        const payment = await paymentOf(fixture.orderId);
        expect(payment.refunds[0].settledByHand).toBeUndefined();
        expect(payment.refunds).toHaveLength(1);
        expect(payment.refunds[0]).toMatchObject({ status: 'pending', reason: 'cancellation' });
        expect(owedRows()).toHaveLength(1);
        expect(owedRows()[0].metadata).toMatchObject({
            refundId: payment.refunds[0].id
        });
    });
});
