/**
 * @module
 * A withdrawal before dispatch with real money behind it: the order is cancelled, the payment goes
 * back in full through the order's own refund path, and the return written beside it is closed at
 * birth. Pins what crosses module lines — one `payment.refunded`, one credit note, one mail from
 * `returns` — so a refund and a return never announce the same money twice.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, readOrder, toOrderItem } from '@modules/orders/tests/factories';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { OrderStatus } from '@types';
import { inventoryService } from '@modules/inventory';
import { invoicingService } from '@modules/invoicing';
import { createIntent, confirmPayment, paymentService, PAYMENT_REFUNDED } from '@modules/payments';
import paymentsModule from '@modules/payments/module';
import invoicingModule from '@modules/invoicing/module';
import returnsModule from '../../module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asAdmin, asCustomer, testCallerContext } from '@tests/callers';
import { createReturn } from '../../services';
import { returnRepository } from '../../repository';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule, invoicingModule, returnsModule]);
    mockEnqueueEmail.mockClear();
});

afterEach(() => resetDomainEvents());

/** Waits for a fire-and-forget listener's write — the credit note follows `PAYMENT_REFUNDED`. */
const waitFor = async (check: () => Promise<boolean>): Promise<void> => {
    const startedAt = Date.now();
    while (!(await check())) {
        if (Date.now() - startedAt > 3000) throw new Error('waitFor: timed out');
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
};

/** A customer who bought a shirt (30.00) and a mug (10.00), and paid for it by card. */
const paidOrder = async () => {
    const user = await createUser({ email: 'withdrawer@example.com' });
    const shirt = await createProduct({ title: 'Shirt', price: 30, onHand: 10 });
    const mug = await createProduct({ title: 'Mug', price: 10, onHand: 10 });
    const order = await createOrder(user, [toOrderItem(shirt, 1), toOrderItem(mug, 1)]);
    const orderId = String(order._id);
    await inventoryService.reserveForOrder(orderId, [
        { productId: String(shirt._id), quantity: 1 },
        { productId: String(mug._id), quantity: 1 }
    ]);
    const intent = await createIntent(orderId, asCustomer(user.id));
    if (!intent.success) throw new Error('intent refused');
    await confirmPayment(intent.data.id, 'pm_card_visa', asCustomer(user.id), testCallerContext);
    return { user, orderId };
};

describe('a withdrawal before dispatch on a paid order', () => {
    it('refunds the payment once, issues its credit note, and writes the return closed', async () => {
        const { user, orderId } = await paidOrder();
        const refunds: { returnId?: string; amount: number; full: boolean }[] = [];
        onDomainEvent(PAYMENT_REFUNDED, (payload) => void refunds.push(payload));

        const outcome = await createReturn(
            { orderId, reason: 'withdrawal' },
            asCustomer(user.id),
            testCallerContext
        );

        expect(outcome.kind).toBe('created');
        const stored = await readOrder(orderId);
        expect(stored?.status).toBe(OrderStatus.cancelled);
        const payment = await paymentService.getForOrder(orderId, asAdmin());
        expect(payment.success && payment.data).toMatchObject({
            status: 'refunded',
            amountRefunded: 40
        });
        const [written] = await returnRepository.findByOrderId(orderId);
        expect(written).toMatchObject({ status: 'closed', refundAmount: 40, lines: [] });

        // Both listeners of the one event: the credit note is written by the module's own, this
        // test's runs after it, so seeing the note alone is not seeing the event captured.
        await waitFor(() =>
            invoicingService
                .findCreditNotesForOrder(orderId)
                .then((notes) => notes.length > 0 && refunds.length > 0)
        );
        // The refund is the order's own, not the return's: it carries no `returnId`, and the
        // return — closed already — is not closed a second time by it.
        expect(refunds).toEqual([expect.objectContaining({ amount: 40, full: true })]);
        expect(refunds[0].returnId).toBeUndefined();
        const notes = await invoicingService.findCreditNotesForOrder(orderId);
        expect(notes).toHaveLength(1);
    });

    it('sends one mail from returns — the acknowledgement, never the return-closed notice', async () => {
        const { user, orderId } = await paidOrder();
        mockEnqueueEmail.mockClear();

        await createReturn(
            { orderId, reason: 'withdrawal' },
            asCustomer(user.id),
            testCallerContext
        );

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

        await createReturn(
            { orderId, reason: 'withdrawal' },
            asCustomer(user.id),
            testCallerContext
        );

        // The refund mail is fire-and-forget behind `PAYMENT_REFUNDED`'s own write.
        const named = (template: string) =>
            mockEnqueueEmail.mock.calls.filter(([, name]) => name === template);
        await waitFor(() => Promise.resolve(named('orders.order-refunded').length > 0));
        // Let any second, wrongly sent copy surface before counting.
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(named('orders.order-refunded')).toHaveLength(1);
        expect(named('returns.notice')).toHaveLength(1);
        // A withdrawal is acknowledged by `returns`; the person-cancel mail is not for it.
        expect(named('orders.order-cancelled')).toHaveLength(0);
    });
});
