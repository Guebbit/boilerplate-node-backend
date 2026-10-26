/**
 * @module
 * Closing a return by hand: the way out for a received return whose refund was canceled or paid
 * outside the app. It closes only a `received` return, moves no money and no stock, announces no
 * `return.closed` (whose mail says the money went back) and keeps the note in the audit row.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { timelineOf } from '@modules/orders/tests/factories';
import { asReject } from '@tests/response';
import { resetDomainEvents } from '@kernel/events';
import { asAdmin, asCustomer, callerContextAs } from '@tests/callers';
import { registerAuditSink, type AuditEntry } from '@infrastructure/observability/audit';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { carryOrderTo } from '@modules/delivery/tests/factories';
import { inventoryService } from '@modules/inventory';
import paymentsModule from '@modules/payments/module';
import { paymentService } from '@modules/payments';
import returnsModule from '../../module';
import { returnService } from '../../services';
import { RETURN_CLOSED } from '../../events';

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

/** A received return on a cash-paid order whose pending refund staff then canceled. */
const receivedWithCanceledRefund = async () => {
    const fixture = await paidInCash();
    await carryOrderTo(fixture.orderId, 'delivered');
    const created = await returnService.createReturn(
        { orderId: fixture.orderId, reason: 'withdrawal' },
        asCustomer(fixture.user.id),
        callerContextAs('customer', fixture.user.id)
    );
    if (!created.success) throw new Error('expected a return');
    const returnId = String(created.data._id);
    await returnService.receiveReturn(returnId, {}, callerContextAs('warehouse'));
    const payment = await paymentOf(fixture.orderId);
    const canceled = await paymentService.cancelRefund(
        payment.id,
        payment.refunds[0].id,
        'paid back in cash already',
        asAdmin(),
        callerContextAs('admin')
    );
    if (!canceled.success) throw new Error('cancel refused');
    return { ...fixture, returnId };
};

describe('closing a received return by hand', () => {
    it('closes it, writes the audit with the note and the timeline row, and announces nothing', async () => {
        const { orderId, returnId } = await receivedWithCanceledRefund();
        await settleOutboxNudges();
        audited = [];

        const closed = await returnService.closeReturnByHand(
            returnId,
            'paid back in cash already',
            callerContextAs('admin')
        );

        expect(closed.success && closed.data.status).toBe('closed');
        expect(closed.success && closed.data.closedAt).toBeDefined();
        expect(audited.filter(({ action }) => action === 'admin.return.closed')).toEqual([
            expect.objectContaining({
                targetType: 'return',
                targetId: returnId,
                metadata: { orderId, note: 'paid back in cash already' }
            })
        ]);
        const rows = await timelineOf(orderId, 'return_closed');
        expect(rows).toHaveLength(1);
        expect(JSON.stringify(rows[0])).not.toContain('cash');
        await settleOutboxNudges();
        expect(await outboxEventModel.countDocuments({ name: RETURN_CLOSED })).toBe(0);
    });

    it('takes no note, and offers the action only on a received return', async () => {
        const { returnId } = await receivedWithCanceledRefund();
        const before = await returnService.getReturn(returnId, asAdmin());
        expect(before.success && before.data.actions?.close).toBe(true);

        const closed = await returnService.closeReturnByHand(
            returnId,
            undefined,
            callerContextAs('admin')
        );

        expect(closed.success).toBe(true);
        const after = await returnService.getReturn(returnId, asAdmin());
        expect(after.success && after.data.actions?.close).toBe(false);
        const row = audited.find(({ action }) => action === 'admin.return.closed');
        expect(row?.metadata).not.toHaveProperty('note');
    });

    it('answers 409 RETURN_NOT_CLOSABLE to a second close and writes nothing more', async () => {
        const { orderId, returnId } = await receivedWithCanceledRefund();
        await returnService.closeReturnByHand(returnId, 'x', callerContextAs('admin'));
        audited = [];

        const second = await returnService.closeReturnByHand(
            returnId,
            'x',
            callerContextAs('admin')
        );

        expect(asReject(second).status).toBe(409);
        expect(asReject(second).errors[0].code).toBe('RETURN_NOT_CLOSABLE');
        expect(audited).toHaveLength(0);
        expect(await timelineOf(orderId, 'return_closed')).toHaveLength(1);
    });

    it('refuses a requested return: that one is declined, not closed', async () => {
        const fixture = await paidInCash();
        await carryOrderTo(fixture.orderId, 'delivered');
        const created = await returnService.createReturn(
            { orderId: fixture.orderId, reason: 'defective' },
            asCustomer(fixture.user.id),
            callerContextAs('customer', fixture.user.id)
        );
        if (!created.success) throw new Error('expected a return');
        expect(created.data.status).toBe('requested');

        const result = await returnService.closeReturnByHand(
            String(created.data._id),
            undefined,
            callerContextAs('admin')
        );

        expect(asReject(result).errors[0].code).toBe('RETURN_NOT_CLOSABLE');
    });

    it('answers 404 for a return that does not exist', async () => {
        const result = await returnService.closeReturnByHand(
            '64b64b64b64b64b64b64b64b',
            undefined,
            callerContextAs('admin')
        );

        expect(asReject(result).status).toBe(404);
    });
});
