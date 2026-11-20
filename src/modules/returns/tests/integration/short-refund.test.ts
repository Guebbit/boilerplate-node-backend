/**
 * @module
 * A return that asks for money its payment cannot give all of: the part of the payment that
 * already went back another way (goodwill) is out of reach. Against a real database and the real
 * `fake` payment provider. What is pinned: the receipt that opens no record leaves the return
 * `received` (no "refunded" mail, no `return.closed`) and writes ONE `payment.return_refund_short`
 * fact; a refund opened for less than asked still closes the return and writes the fact, the return
 * keeping its figure; a hand close writes `return.closed_by_hand` and nothing public.
 */

import { refundOrderPayment } from '@modules/payments/tests/factories';
import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { asAdmin, asCustomer, callerContextAs, testCallerContext } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { carryOrderTo } from '@modules/delivery/tests/factories';
import { inventoryService } from '@modules/inventory';
import paymentsModule from '@modules/payments/module';
import { paymentService } from '@modules/payments';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import returnsModule from '../../module';
import { returnService } from '../../services';
import { returnRepository } from '../../repository';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));

/** Stands in for the mail queue; the cases assert which mail was enqueued. */
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule, returnsModule]);
    mockEnqueueEmail.mockClear();
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** A distinct address per customer. */
let customers = 0;

/** Two shirts (30.00 each), paid by card (unless `pay` is false) and delivered: 60.00 on the payment. */
const paidAndDelivered = async (pay = true) => {
    customers += 1;
    const user = await createUser({ email: `short-${customers}@example.com` });
    const shirt = await createProduct({ title: 'Shirt', price: '30.00', onHand: 10 });
    const order = await createOrder(user, [toOrderItem(shirt, 2)]);
    const orderId = String(order._id);
    await inventoryService.reserveForOrder(orderId, [
        { productId: String(shirt._id), quantity: 2 }
    ]);
    if (pay) {
        const intent = await paymentService.createIntent(orderId, asCustomer(user.id));
        if (!intent.success) throw new Error('intent refused');
        await paymentService.confirmPayment(
            intent.data.id,
            'pm_card_visa',
            asCustomer(user.id),
            testCallerContext
        );
    }
    await carryOrderTo(orderId, 'delivered');
    return { user, orderId };
};

/** A goodwill refund of `amount` on the order's payment, made before the return. */
const goodwill = (orderId: string, amount: string) =>
    refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount });

/** A withdrawal on the whole order, born approved. */
const withdrawal = async (fixture: Awaited<ReturnType<typeof paidAndDelivered>>) => {
    const outcome = await returnService.createReturn(
        { orderId: fixture.orderId, reason: 'withdrawal' },
        asCustomer(fixture.user.id),
        testCallerContext
    );
    if (!outcome.success) throw new Error('expected a return');
    await settleOutboxNudges();
    return String(outcome.data._id);
};

/** The `payment.return_refund_short` rows written so far, as their payloads. */
const shortFacts = () =>
    outboxEventModel
        .find({ name: 'payment.return_refund_short' })
        .lean()
        .exec()
        .then((rows) => rows.map(({ payload }) => payload));

/** The mails told to the buyer that their money went back. */
const refundedMails = () =>
    mockEnqueueEmail.mock.calls.filter(([, template]) => template === 'returns.notice');

describe('receiving a return whose payment has nothing left', () => {
    it('leaves it received, tells the buyer nothing, and writes the short fact once', async () => {
        const fixture = await paidAndDelivered();
        await goodwill(fixture.orderId, '60.00');
        const id = await withdrawal(fixture);
        mockEnqueueEmail.mockClear();

        const result = await returnService.receiveReturn(id, {}, callerContextAs('admin'));

        expect(result.success && result.data.status).toBe('received');
        expect(result.success && result.data.refundAmount).toBe('60.00');
        await settleOutboxNudges();
        expect(refundedMails()).toHaveLength(0);
        expect(await outboxEventModel.countDocuments({ name: 'return.closed' })).toBe(0);
        expect(await shortFacts()).toEqual([
            {
                returnId: id,
                orderId: fixture.orderId,
                asked: '60.00',
                opened: '0.00',
                currency: 'EUR',
                cause: 'used_up'
            }
        ]);
    });

    it('writes the short fact for an order with no payment at all, opened 0.00', async () => {
        const fixture = await paidAndDelivered(false);
        const id = await withdrawal(fixture);

        const result = await returnService.receiveReturn(id, {}, callerContextAs('admin'));

        expect(result.success && result.data.status).toBe('received');
        expect(await shortFacts()).toEqual([
            {
                returnId: id,
                orderId: fixture.orderId,
                asked: '60.00',
                opened: '0.00',
                currency: 'EUR',
                cause: 'no_payment'
            }
        ]);
    });

    it('is closed by hand, which announces itself internally and tells nobody', async () => {
        const fixture = await paidAndDelivered();
        await goodwill(fixture.orderId, '60.00');
        const id = await withdrawal(fixture);
        await returnService.receiveReturn(id, {}, callerContextAs('admin'));
        await settleOutboxNudges();
        mockEnqueueEmail.mockClear();

        const closed = await returnService.closeReturnByHand(
            id,
            'paid back in cash',
            callerContextAs('admin')
        );
        await settleOutboxNudges();

        expect(closed.success && closed.data.status).toBe('closed');
        const [event] = await outboxEventModel
            .find({ name: 'return.closed_by_hand' })
            .lean()
            .exec();
        expect(event.payload).toEqual({ returnId: id, orderId: fixture.orderId });
        expect(await outboxEventModel.countDocuments({ name: 'return.closed' })).toBe(0);
        expect(refundedMails()).toHaveLength(0);
    });
});

describe('receiving a return whose payment has only part of it left', () => {
    it('opens what is left, closes the return, keeps its figure and writes the short fact', async () => {
        const fixture = await paidAndDelivered();
        await goodwill(fixture.orderId, '20.00');
        const id = await withdrawal(fixture);

        const result = await returnService.receiveReturn(id, {}, callerContextAs('admin'));

        expect(result.success && result.data.status).toBe('closed');
        expect(result.success && result.data.refundAmount).toBe('60.00');
        expect(await shortFacts()).toEqual([
            {
                returnId: id,
                orderId: fixture.orderId,
                asked: '60.00',
                opened: '40.00',
                currency: 'EUR',
                cause: 'used_up'
            }
        ]);
    });

    it('writes no fact when the whole amount could be opened', async () => {
        const fixture = await paidAndDelivered();
        const id = await withdrawal(fixture);

        const result = await returnService.receiveReturn(id, {}, callerContextAs('admin'));

        expect(result.success && result.data.status).toBe('closed');
        expect(await shortFacts()).toEqual([]);
    });
});

describe('a proof of sending on a payment with nothing left', () => {
    it('writes the short fact then, and the goods arriving after leave the return received', async () => {
        const fixture = await paidAndDelivered();
        await goodwill(fixture.orderId, '60.00');
        const id = await withdrawal(fixture);

        const proof = await returnService.recordProofOfSending(
            id,
            { sentAt: new Date(), carrier: 'Poste Italiane', reference: 'RR123456789IT' },
            callerContextAs('admin')
        );
        expect(proof.success).toBe(true);
        expect(await shortFacts()).toHaveLength(1);

        const received = await returnService.receiveReturn(id, {}, callerContextAs('admin'));

        expect(received.success && received.data.status).toBe('received');
        const stored = await returnRepository.findById(id);
        expect(stored?.status).toBe('received');
        expect(await outboxEventModel.countDocuments({ name: 'return.closed' })).toBe(0);
        // Asked once at the proof; the goods do not ask again.
        expect(await shortFacts()).toHaveLength(1);
    });
});
