/**
 * @module
 * The buyer's proof of sending against a real database and the real `fake` payment provider: on a
 * withdrawal it opens the refund at once, once; on a faulty item it only records; and the goods
 * arriving afterwards neither open a second refund nor let a handling deduction come out of one.
 */

import { withdrawalRefundDueBy } from '@modules/orders';
import { shopTimezone } from '@modules/shop';
import { storedRefundStamps } from '@modules/payments/tests/factories';
import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { withEnvironmentOverrides } from '@tests/environment';
import { eventually } from '@tests/eventually';
import { resetDomainEvents } from '@kernel/events';
import { asAdmin, asCustomer, testCallerContext, callerContextAs } from '@tests/callers';
import { asReject } from '@tests/response';
import { createUser } from '@modules/users/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import { createOrder, timelineOf, toOrderItem } from '@modules/orders/tests/factories';
import { carryOrderTo } from '@modules/delivery/tests/factories';
import { inventoryService } from '@modules/inventory';
import paymentsModule from '@modules/payments/module';
import { paymentService } from '@modules/payments';
import { fakePaymentProvider } from '@scenarios/support/doubles/payments/fake';
import returnsModule from '../../module';
import { returnService } from '../../services';
import { returnRepository } from '../../repository';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule, returnsModule]);
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** The carrier's document, as staff would type it. */
const proofOn = (sentAt: Date) => ({
    sentAt,
    carrier: 'Poste Italiane',
    reference: 'RR123456789IT'
});

/** A distinct address per fixture. */
let buyers = 0;

/** A paid, delivered order of two shirts, and an approved return on it for `reason`. */
const approvedReturn = async (reason: 'withdrawal' | 'defective') => {
    buyers += 1;
    const user = await createUser({ email: `proof-${buyers}@example.com` });
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
    const outcome = await returnService.createReturn(
        { orderId, reason },
        asCustomer(user.id),
        testCallerContext
    );
    if (!outcome.success) throw new Error('expected a return');
    const returnId = String(outcome.data._id);
    if (reason !== 'withdrawal')
        await returnService.approveReturn(returnId, callerContextAs('admin'));
    return { shirt, orderId, returnId };
};

describe('a proof of sending on a withdrawal', () => {
    it('opens the refund then, due at the end of the 14th shop day after the request', async () => {
        const { orderId, returnId } = await approvedReturn('withdrawal');
        const requested = await returnRepository.findById(returnId);

        const result = await returnService.recordProofOfSending(
            returnId,
            proofOn(new Date()),
            callerContextAs('admin')
        );

        expect(result.success && result.data.status).toBe('approved');
        expect(result.success && result.data.refundAmount).toBe('60.00');
        expect(await storedRefundStamps(orderId)).toEqual([
            expect.objectContaining({
                returnId,
                dueRule: 'withdrawal',
                dueBy: withdrawalRefundDueBy(requested!.requestedAt, shopTimezone())
            })
        ]);
    });

    it('stores the document and writes one timeline row naming the return', async () => {
        const { orderId, returnId } = await approvedReturn('withdrawal');
        const sentAt = new Date('2026-03-02T09:00:00.000Z');

        await returnService.recordProofOfSending(
            returnId,
            proofOn(sentAt),
            callerContextAs('admin')
        );

        const stored = await returnRepository.findById(returnId);
        expect(stored).toMatchObject({
            proofOfSendingAt: sentAt,
            proofCarrier: 'Poste Italiane',
            proofReference: 'RR123456789IT'
        });
        const rows = await timelineOf(orderId, 'proof_of_sending_recorded');
        expect(rows.map(({ data }) => data)).toEqual([{ returnId }]);
    });

    it('is recorded once: a second call answers 409 and opens no second refund', async () => {
        const { orderId, returnId } = await approvedReturn('withdrawal');
        await returnService.recordProofOfSending(
            returnId,
            proofOn(new Date()),
            callerContextAs('admin')
        );

        const second = await returnService.recordProofOfSending(
            returnId,
            proofOn(new Date()),
            callerContextAs('admin')
        );

        expect(asReject(second).status).toBe(409);
        expect(asReject(second).errors[0].code).toBe('RETURN_PROOF_ALREADY_RECORDED');
        expect(await storedRefundStamps(orderId)).toHaveLength(1);
    });

    it('turns the recordProof action off once a proof is on the return', async () => {
        const { returnId } = await approvedReturn('withdrawal');
        const before = await returnRepository.findById(returnId);
        await returnService.recordProofOfSending(
            returnId,
            proofOn(new Date()),
            callerContextAs('admin')
        );
        const after = await returnRepository.findById(returnId);

        expect(returnService.withActions(before!, asAdmin()).actions.recordProof).toBe(true);
        expect(returnService.withActions(after!, asAdmin()).actions.recordProof).toBe(false);
    });

    it('refuses a return that is not waiting for its goods', async () => {
        const { returnId } = await approvedReturn('withdrawal');
        await returnService.receiveReturn(returnId, {}, callerContextAs('admin'));

        const result = await returnService.recordProofOfSending(
            returnId,
            proofOn(new Date()),
            callerContextAs('admin')
        );

        expect(asReject(result).errors[0].code).toBe('RETURN_NOT_RECEIVABLE');
    });

    it('makes the refund due the day on the proof when that is after the 14 days', async () => {
        const { orderId, returnId } = await approvedReturn('withdrawal');
        const sentAt = new Date(Date.now() + 40 * 24 * 3_600_000);

        await returnService.recordProofOfSending(
            returnId,
            proofOn(sentAt),
            callerContextAs('admin')
        );

        expect(await storedRefundStamps(orderId)).toEqual([
            expect.objectContaining({ dueRule: 'withdrawal', dueBy: sentAt })
        ]);
    });
});

describe('the goods arriving after a proof on a withdrawal', () => {
    it('restocks, opens no second refund and closes the return, the refund being settled', async () => {
        const { shirt, orderId, returnId } = await approvedReturn('withdrawal');
        await returnService.recordProofOfSending(
            returnId,
            proofOn(new Date()),
            callerContextAs('admin')
        );

        const result = await returnService.receiveReturn(returnId, {}, callerContextAs('admin'));

        expect(result.success && result.data.status).toBe('closed');
        expect(result.success && result.data.refundAmount).toBe('60.00');
        expect(await countersOf(shirt._id)).toMatchObject({ onHand: 10 });
        expect(await storedRefundStamps(orderId)).toHaveLength(1);
    });

    it('refuses a handling deduction with 409, before anything moves', async () => {
        const { shirt, returnId } = await approvedReturn('withdrawal');
        await returnService.recordProofOfSending(
            returnId,
            proofOn(new Date()),
            callerContextAs('admin')
        );

        const result = await returnService.receiveReturn(
            returnId,
            { handlingDeduction: '1.00' },
            callerContextAs('admin')
        );

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('RETURN_REFUND_OPENED_ON_PROOF');
        const stored = await returnRepository.findById(returnId);
        expect(stored?.status).toBe('approved');
        expect(await countersOf(shirt._id)).toMatchObject({ onHand: 8 });
    });

    it('stays received while the refund is still owed, and the sweep closes it when it lands', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId, returnId } = await approvedReturn('withdrawal');
            jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(new Error('down'));
            await returnService.recordProofOfSending(
                returnId,
                proofOn(new Date()),
                callerContextAs('admin')
            );

            const result = await returnService.receiveReturn(
                returnId,
                {},
                callerContextAs('admin')
            );

            expect(result.success && result.data.status).toBe('received');
            expect(await storedRefundStamps(orderId)).toHaveLength(1);

            await paymentService.retryOpenRefunds();

            await eventually(async () => {
                const stored = await returnRepository.findById(returnId);
                return stored?.status === 'closed';
            });
        }));
});

describe('a proof of sending on a faulty item', () => {
    it('records the proof and opens no refund: the remedy is decided at receipt', async () => {
        const { orderId, returnId } = await approvedReturn('defective');

        const result = await returnService.recordProofOfSending(
            returnId,
            proofOn(new Date('2026-03-02T09:00:00.000Z')),
            callerContextAs('admin')
        );

        expect(result.success && result.data.proofOfSendingAt).toEqual(
            new Date('2026-03-02T09:00:00.000Z')
        );
        expect(result.success && result.data.refundAmount).toBeUndefined();
        expect(await storedRefundStamps(orderId)).toEqual([]);
    });

    it('makes a refund picked at receipt due the moment the proof is dated, the earlier one', async () => {
        const { orderId, returnId } = await approvedReturn('defective');
        const sentAt = new Date('2026-03-02T09:00:00.000Z');
        await returnService.recordProofOfSending(
            returnId,
            proofOn(sentAt),
            callerContextAs('admin')
        );

        await returnService.receiveReturn(returnId, {}, callerContextAs('admin'));

        expect(await storedRefundStamps(orderId)).toEqual([
            expect.objectContaining({ returnId, dueRule: 'faulty', dueBy: sentAt })
        ]);
    });
});
