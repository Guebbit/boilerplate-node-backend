/**
 * @module
 * A withdrawal before dispatch with real money behind it: the order is canceled, the payment goes
 * back in full through the order's own refund path, and the return written beside it is closed at
 * birth. Pins what crosses module lines — one `payment.refunded`, one credit note, one mail from
 * `returns` — so a refund and a return never announce the same money twice.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, readOrder, toOrderItem } from '@modules/orders/tests/factories';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { OrderStatus } from '@types';
import { inventoryService } from '@modules/inventory';
import { invoicingService } from '@modules/invoicing';
import { paymentService, PAYMENT_REFUNDED } from '@modules/payments';
import paymentsModule from '@modules/payments/module';
import invoicingModule from '@modules/invoicing/module';
import returnsModule from '../../module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asAdmin, asCustomer, testCallerContext } from '@tests/callers';
import { returnService } from '../../services';
import { returnRepository } from '../../repository';
import { eventually } from '@tests/eventually';
import { payByCard, storedRefundStamps } from '@modules/payments/tests/factories';
import { withdrawalRefundDueBy } from '@modules/orders';
import { shopTimezone } from '@modules/shop';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));

/** Stands in for the mail queue; the cases assert which mail was enqueued. */
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule, invoicingModule, returnsModule]);
    mockEnqueueEmail.mockClear();
});

afterEach(() => resetDomainEvents());

/** A customer who bought a shirt (30.00) and a mug (10.00), and paid for it by card. */
const paidOrder = async () => {
    const user = await createUser({ email: 'withdrawer@example.com' });
    const shirt = await createProduct({ title: 'Shirt', price: '30.00', onHand: 10 });
    const mug = await createProduct({ title: 'Mug', price: '10.00', onHand: 10 });
    const order = await createOrder(user, [toOrderItem(shirt, 1), toOrderItem(mug, 1)]);
    const orderId = String(order._id);
    await inventoryService.reserveForOrder(orderId, [
        { productId: String(shirt._id), quantity: 1 },
        { productId: String(mug._id), quantity: 1 }
    ]);
    await payByCard(order, user);
    // Delivery is after the response: let the relay publish the settlement's rows first.
    await settleOutboxNudges();
    return { user, orderId };
};

describe('a withdrawal before dispatch on a paid order', () => {
    it('refunds the payment once, issues its credit note, and writes the return closed', async () => {
        const { user, orderId } = await paidOrder();
        const refunds: { returnId?: string; amount: string; full: boolean }[] = [];
        onDomainEvent(PAYMENT_REFUNDED, (payload) => void refunds.push(payload));

        const outcome = await returnService.createReturn(
            { orderId, reason: 'withdrawal' },
            asCustomer(user.id),
            testCallerContext
        );

        expect(outcome.success).toBe(true);
        const stored = await readOrder(orderId);
        expect(stored?.status).toBe(OrderStatus.canceled);
        // The refund is the cancel's event, delivered by the relay after the response.
        await settleOutboxNudges();
        const payment = await paymentService.getForOrder(orderId, asAdmin());
        expect(payment.success && payment.data).toMatchObject({
            status: 'succeeded',
            displayStatus: 'refunded',
            amountRefunded: '40.00'
        });
        const [written] = await returnRepository.findByOrderId(orderId);
        expect(written).toMatchObject({ status: 'closed', refundAmount: '40.00', lines: [] });

        // Both listeners of the one event run inside the relay pass; the drain waits for both.
        await settleOutboxNudges();
        /**
         * The refund is the order's own, not the return's: it carries no `returnId`, and the
         * return — closed already — is not closed a second time by it.
         */
        expect(refunds).toEqual([expect.objectContaining({ amount: '40.00', full: true })]);
        expect(refunds[0].returnId).toBeUndefined();
        const notes = await invoicingService.findCreditNotesForOrder(orderId);
        expect(notes).toHaveLength(1);
    });

    it('stamps the refund with the end of the shop day 14 days after the shop was told', async () => {
        const { user, orderId } = await paidOrder();

        const outcome = await returnService.createReturn(
            { orderId, reason: 'withdrawal' },
            asCustomer(user.id),
            testCallerContext
        );
        await settleOutboxNudges();

        const [written] = await returnRepository.findByOrderId(orderId);
        expect(outcome.success).toBe(true);
        expect(await storedRefundStamps(orderId)).toEqual([
            expect.objectContaining({
                dueRule: 'withdrawal',
                dueBy: withdrawalRefundDueBy(written.requestedAt, shopTimezone())
            })
        ]);
    });

    it('sends one mail from returns — the acknowledgement, never the return-closed notice', async () => {
        const { user, orderId } = await paidOrder();
        mockEnqueueEmail.mockClear();

        await returnService.createReturn(
            { orderId, reason: 'withdrawal' },
            asCustomer(user.id),
            testCallerContext
        );
        await settleOutboxNudges();

        const notices = mockEnqueueEmail.mock.calls.filter(
            ([, template]) => template === 'returns.notice'
        );
        expect(notices).toHaveLength(1);
        expect(notices[0][0].subject).toBe('We received your withdrawal');
        // No goods are expected, so no postage line and no address to send them to.
        expect(notices[0][2]).toMatchObject({ postage: undefined, address: undefined });
    });

    it('tells the buyer the money is back exactly once, and never mails a cancel notice', async () => {
        const { user, orderId } = await paidOrder();
        mockEnqueueEmail.mockClear();

        await returnService.createReturn(
            { orderId, reason: 'withdrawal' },
            asCustomer(user.id),
            testCallerContext
        );

        const named = (template: string) =>
            mockEnqueueEmail.mock.calls.filter(([, name]) => name === template);
        await settleOutboxNudges();
        /**
         * The refund mail starts inside `announceRefund` with `void`, so `settleOutboxNudges`
         * returns before it is sent.
         */
        await eventually(() => named('payments.refund-issued').length > 0);

        expect(named('payments.refund-issued')).toHaveLength(1);
        expect(named('returns.notice')).toHaveLength(1);
        // A withdrawal is acknowledged by `returns`; the person-cancel mail is not for it.
        expect(named('orders.order-canceled')).toHaveLength(0);
    });
});

/** The withdrawal's own outbox rows for the order, whatever their delivery state. */
const withdrawalRows = (orderId: string) =>
    outboxEventModel.countDocuments({
        aggregateId: orderId,
        name: { $in: ['order.canceled', 'return.requested', 'return.closed'] }
    });

describe('a withdrawal before dispatch that dies half way', () => {
    it('keeps the order and writes nothing when the dated record cannot be written', async () => {
        const { user, orderId } = await paidOrder();
        jest.spyOn(returnRepository, 'create').mockRejectedValueOnce(new Error('disk full'));

        await expect(
            returnService.createReturn(
                { orderId, reason: 'withdrawal' },
                asCustomer(user.id),
                testCallerContext
            )
        ).rejects.toThrow('disk full');

        // Record and cancel both or neither: the cancel rolled back with the record.
        const stored = await readOrder(orderId);
        expect(stored?.status).toBe(OrderStatus.paid);
        expect(await returnRepository.findByOrderId(orderId)).toEqual([]);
        expect(await withdrawalRows(orderId)).toBe(0);
    });

    it('writes no record when the cancel cannot announce itself', async () => {
        const { user, orderId } = await paidOrder();
        jest.spyOn(outboxEventModel, 'create').mockRejectedValueOnce(new Error('disk full'));

        await expect(
            returnService.createReturn(
                { orderId, reason: 'withdrawal' },
                asCustomer(user.id),
                testCallerContext
            )
        ).rejects.toThrow('disk full');

        const stored = await readOrder(orderId);
        expect(stored?.status).toBe(OrderStatus.paid);
        expect(await returnRepository.findByOrderId(orderId)).toEqual([]);
        expect(await withdrawalRows(orderId)).toBe(0);
    });
});
