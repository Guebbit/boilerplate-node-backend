/**
 * @module
 * Receiving a return whose buyer staff already paid back outside the application (`paidOutside`):
 * the refund record is born settled by hand in the receipt's transaction, so a card is never
 * refunded a second time, and the return closes in the same step. Against a real database, the real
 * `fake` payment provider and the real credit-note listener.
 */

import { refundOrderPayment } from '@modules/payments/tests/factories';
import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { eventually } from '@tests/eventually';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { registerAuditSink, type AuditEntry } from '@infrastructure/observability/audit';
import { asAdmin, asCustomer, callerContextAs, testCallerContext } from '@tests/callers';
import { asReject, asSuccess } from '@tests/response';
import { createUser } from '@modules/users/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { carryOrderTo } from '@modules/delivery/tests/factories';
import { inventoryService } from '@modules/inventory';
import { invoicingService } from '@modules/invoicing';
import invoicingModule from '@modules/invoicing/module';
import paymentsModule from '@modules/payments/module';
import { paymentService } from '@modules/payments';
import { fakePaymentProvider } from '@scenarios/support/doubles/payments/fake';
import returnsModule from '../../module';
import { returnService } from '../../services';
import { returnRepository } from '../../repository';

setupTestDb();

/** The audit rows written since the test began. */
let audited: AuditEntry[] = [];

beforeEach(() => {
    registerCheckoutModules([paymentsModule, invoicingModule, returnsModule]);
    audited = [];
    registerAuditSink((entry) => audited.push(entry));
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** A distinct address per customer. */
let customers = 0;

/** Two shirts (30.00 each) paid by card and delivered: 60.00 on the payment. */
const paidAndDelivered = async () => {
    customers += 1;
    const user = await createUser({ email: `outside-return-${customers}@example.com` });
    const shirt = await createProduct({ title: 'Shirt', price: '30.00', onHand: 10 });
    const order = await createOrder(user, [toOrderItem(shirt, 2)]);
    const orderId = String(order._id);
    await inventoryService.reserveForOrder(orderId, [
        { productId: String(shirt._id), quantity: 2 }
    ]);
    const intent = await paymentService.createIntent(orderId, asCustomer(user.id));
    if (!intent.success) throw new Error('intent refused');
    await paymentService.confirmPayment(
        intent.data.id,
        'pm_card_visa',
        asCustomer(user.id),
        testCallerContext
    );
    await carryOrderTo(orderId, 'delivered');
    return { user, shirt, orderId };
};

/** A return on the whole order: a withdrawal is born approved, anything else is approved here. */
const openedReturn = async (
    fixture: Awaited<ReturnType<typeof paidAndDelivered>>,
    reason: 'withdrawal' | 'defective' = 'withdrawal'
) => {
    const outcome = await returnService.createReturn(
        { orderId: fixture.orderId, reason },
        asCustomer(fixture.user.id),
        testCallerContext
    );
    if (!outcome.success) throw new Error('expected a return');
    const id = String(outcome.data._id);
    if (reason !== 'withdrawal') await returnService.approveReturn(id, callerContextAs('admin'));
    await settleOutboxNudges();
    return id;
};

/** The payment behind an order, as an operator reads it. */
const paymentOf = async (orderId: string) => {
    const result = await paymentService.getForOrder(orderId, asAdmin());
    if (!result.success) throw new Error('no payment');
    return result.data;
};

/** A return's status, read back. */
const statusOf = (id: string) => returnRepository.findById(id).then((stored) => stored?.status);

/** The fact names that wake a person for a refund: owed by hand, or short for a return. */
const todoFacts = () =>
    outboxEventModel
        .find({ name: { $in: ['payment.refund_owed_by_hand', 'payment.return_refund_short'] } })
        .lean()
        .exec();

describe('a return received with the refund paid outside', () => {
    it('closes at once, never asks the card, and issues the credit note', async () => {
        const fixture = await paidAndDelivered();
        const id = await openedReturn(fixture);
        const send = jest.spyOn(fakePaymentProvider, 'refund').mockClear();

        const result = asSuccess(
            await returnService.receiveReturn(
                id,
                { paidOutside: { method: 'bank_transfer', reference: 'CRO 1' } },
                callerContextAs('admin')
            )
        );

        expect(result.data.status).toBe('closed');
        expect(send).not.toHaveBeenCalled();
        const payment = await paymentOf(fixture.orderId);
        expect(payment.refunds).toHaveLength(1);
        expect(payment.refunds[0]).toMatchObject({
            amount: '60.00',
            status: 'succeeded',
            settledByHand: true,
            reason: 'return',
            returnId: id,
            paidOutside: { method: 'bank_transfer', reference: 'CRO 1' }
        });
        expect(payment.amountRefunded).toBe('60.00');
        const stored = await returnRepository.findById(id);
        expect(stored?.closedAt).toBeInstanceOf(Date);
        await eventually(async () => {
            const notes = await invoicingService.findCreditNotesForOrder(fixture.orderId);
            return notes.length === 1;
        });
        // No to-do: the record is born settled, and nothing was short.
        expect(await todoFacts()).toEqual([]);
        // Exactly one settlement row, written once the receipt committed (not inside its transaction).
        const rows = audited.filter(
            ({ action }) => action === 'admin.payment.refund_settled_by_hand'
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].metadata).toMatchObject({ refundId: payment.refunds[0].id });
    });

    it('answers 403 to a caller who may receive but not refund, and receives nothing', async () => {
        const fixture = await paidAndDelivered();
        const id = await openedReturn(fixture);
        const before = await countersOf(fixture.shirt._id);

        const refused = asReject(
            await returnService.receiveReturn(
                id,
                { paidOutside: { method: 'cash' } },
                callerContextAs('warehouse')
            )
        );

        expect(refused.status).toBe(403);
        expect(await statusOf(id)).toBe('approved');
        const untouched = await paymentOf(fixture.orderId);
        expect(untouched.refunds).toEqual([]);
        expect(await countersOf(fixture.shirt._id)).toEqual(before);
    });

    it('is refused on a remedy that moves no money, and receives nothing', async () => {
        const fixture = await paidAndDelivered();
        const id = await openedReturn(fixture, 'defective');

        const refused = asReject(
            await returnService.receiveReturn(
                id,
                { remedy: 'replace', paidOutside: { method: 'cash' } },
                callerContextAs('admin')
            )
        );

        expect(refused.status).toBe(422);
        expect(refused.errors[0]).toMatchObject({
            code: 'RETURN_REMEDY_INVALID',
            details: { field: 'paidOutside' }
        });
        expect(await statusOf(id)).toBe('approved');
    });

    it('is refused when the proof of sending already opened the refund', async () => {
        const fixture = await paidAndDelivered();
        const id = await openedReturn(fixture);
        asSuccess(
            await returnService.recordProofOfSending(
                id,
                { sentAt: new Date(), carrier: 'Poste Italiane', reference: 'RR1' },
                callerContextAs('admin')
            )
        );

        const refused = asReject(
            await returnService.receiveReturn(
                id,
                { paidOutside: { method: 'cash' } },
                callerContextAs('admin')
            )
        );

        expect(refused.status).toBe(409);
        expect(refused.errors[0].code).toBe('RETURN_REFUND_OPENED_ON_PROOF');
        expect(await statusOf(id)).toBe('approved');
        // The one record the proof opened is still the only one: nothing was settled behind its back.
        const payment = await paymentOf(fixture.orderId);
        expect(payment.refunds).toHaveLength(1);
        expect(payment.refunds[0].settledByHand).toBeUndefined();
    });

    it('is still capped at what the payment has left: closes, and tells a person about the rest', async () => {
        const fixture = await paidAndDelivered();
        asSuccess(
            await refundOrderPayment(fixture.orderId, asAdmin(), callerContextAs('admin'), {
                amount: '40.00'
            })
        );
        const id = await openedReturn(fixture);

        const result = asSuccess(
            await returnService.receiveReturn(
                id,
                { paidOutside: { method: 'cash' } },
                callerContextAs('admin')
            )
        );

        // 60.00 was owed, 20.00 was left: the record is 20.00, settled, and the return closes.
        expect(result.data.status).toBe('closed');
        expect(result.data.refundAmount).toBe('60.00');
        const payment = await paymentOf(fixture.orderId);
        expect(payment.refunds.map(({ amount }) => amount)).toEqual(['40.00', '20.00']);
        expect(payment.refunds[1]).toMatchObject({ status: 'succeeded', settledByHand: true });
        // The short fact is the to-do: it clears only on a hand close (`return.closed_by_hand`), never on this automatic one.
        const facts = await todoFacts();
        expect(facts.map(({ name, payload }) => ({ name, payload }))).toEqual([
            {
                name: 'payment.return_refund_short',
                payload: expect.objectContaining({ returnId: id, asked: '60.00', opened: '20.00' })
            }
        ]);
    });
});
