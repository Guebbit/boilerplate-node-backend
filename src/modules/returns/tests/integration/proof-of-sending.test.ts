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
import { drain } from '@tests/drain';
import { eventually } from '@tests/eventually';
import { resetDomainEvents } from '@kernel/events';
import { asAdmin, asCustomer, testCallerContext, callerContextAs } from '@tests/callers';
import { asReject } from '@tests/response';
import { observePort } from '@tests/ports';
import * as auditPort from '@infrastructure/observability/audit';
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
import { returnModel } from '../../model';

/* Replaced, not spied on — see `tests/support/ports.ts` for why. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

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

/**
 * The receipt's own read, taken just before the proof was saved: the proof lands, then the
 * receipt acts on the stale copy. Its claim loses, and the receipt re-reads the return once.
 * @param returnId - an approved return the proof has not touched yet
 * @param remedy - the remedy staff pick on the receipt
 * @param staleReads - how many reads answer the copy from before the proof; two make the retry lose too
 */
const receiveOnStaleRead = async (
    returnId: string,
    remedy: 'refund' | 'repair',
    staleReads = 1
) => {
    const beforeProof = await returnRepository.findById(returnId);
    await returnService.recordProofOfSending(
        returnId,
        { ...proofOn(new Date()), refundOnProof: true },
        callerContextAs('admin')
    );
    // The proof's own listeners read the return too: let them finish so a stale copy is only ever served to the receipt.
    await drain();
    const findById = jest.spyOn(returnRepository, 'findById');
    for (let read = 0; read < staleReads; read += 1) findById.mockResolvedValueOnce(beforeProof);

    const result = await returnService.receiveReturn(
        returnId,
        { remedy },
        callerContextAs('admin')
    );
    jest.restoreAllMocks();
    return result;
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

    it('turns the cancel action off once the proof opened the refund, and only then', async () => {
        const withdrawal = await approvedReturn('withdrawal');
        const faulty = await approvedReturn('defective');
        for (const { returnId } of [withdrawal, faulty])
            await returnService.recordProofOfSending(
                returnId,
                proofOn(new Date()),
                callerContextAs('admin')
            );
        const afterWithdrawal = await returnRepository.findById(withdrawal.returnId);
        const afterFaulty = await returnRepository.findById(faulty.returnId);

        expect(returnService.withActions(afterWithdrawal!, asAdmin()).actions.cancel).toBe(false);
        expect(returnService.withActions(afterFaulty!, asAdmin()).actions.cancel).toBe(true);
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
        await returnModel.updateOne(
            { _id: returnId },
            { requestedAt: new Date(Date.now() - 40 * 24 * 3_600_000) }
        );
        const sentAt = new Date(Date.now() - 1000);

        await returnService.recordProofOfSending(
            returnId,
            proofOn(sentAt),
            callerContextAs('admin')
        );

        expect(await storedRefundStamps(orderId)).toEqual([
            expect.objectContaining({ dueRule: 'withdrawal', dueBy: sentAt })
        ]);
    });

    it('refuses a date in the future with 422 on sentAt, and records nothing', async () => {
        const { orderId, returnId } = await approvedReturn('withdrawal');

        const result = await returnService.recordProofOfSending(
            returnId,
            proofOn(new Date(Date.now() + 24 * 3_600_000)),
            callerContextAs('admin')
        );

        expect(asReject(result).status).toBe(422);
        expect(asReject(result).errors[0]).toMatchObject({
            code: 'RETURN_PROOF_DATE_INVALID',
            details: { field: 'sentAt' }
        });
        const stored = await returnRepository.findById(returnId);
        expect(stored?.proofOfSendingAt).toBeUndefined();
        expect(await storedRefundStamps(orderId)).toEqual([]);
    });

    it('refuses staff canceling the return with 409 RETURN_REFUND_OPEN: its refund is owed', async () => {
        const { returnId } = await approvedReturn('withdrawal');
        await returnService.recordProofOfSending(
            returnId,
            proofOn(new Date()),
            callerContextAs('admin')
        );

        const result = await returnService.cancelReturn(
            returnId,
            undefined,
            callerContextAs('admin')
        );

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('RETURN_REFUND_OPEN');
        const stored = await returnRepository.findById(returnId);
        expect(stored?.status).toBe('approved');
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

    it('still lets staff cancel the return: nothing was opened', async () => {
        const { returnId } = await approvedReturn('defective');
        await returnService.recordProofOfSending(
            returnId,
            proofOn(new Date()),
            callerContextAs('admin')
        );

        const result = await returnService.cancelReturn(
            returnId,
            undefined,
            callerContextAs('admin')
        );

        expect(result.success && result.data.status).toBe('canceled');
    });
});

describe('refund on proof, chosen by staff on a faulty item', () => {
    it('opens the refund with the proof, due the day on the proof, and says so on the return', async () => {
        const { orderId, returnId } = await approvedReturn('defective');
        const sentAt = new Date('2026-03-02T09:00:00.000Z');

        const result = await returnService.recordProofOfSending(
            returnId,
            { ...proofOn(sentAt), refundOnProof: true },
            callerContextAs('admin')
        );

        expect(result.success && result.data.status).toBe('approved');
        expect(result.success && result.data.refundAmount).toBe('60.00');
        expect(result.success && result.data.refundOnProof).toBe(true);
        expect(await storedRefundStamps(orderId)).toEqual([
            expect.objectContaining({ returnId, dueRule: 'faulty', dueBy: sentAt })
        ]);
    });

    it('opens nothing when staff do not choose it, and stores no flag', async () => {
        const { orderId, returnId } = await approvedReturn('defective');

        await returnService.recordProofOfSending(
            returnId,
            { ...proofOn(new Date()), refundOnProof: false },
            callerContextAs('admin')
        );

        expect(await storedRefundStamps(orderId)).toEqual([]);
        const reread = await returnRepository.findById(returnId);
        expect(reread?.refundOnProof).toBeUndefined();
    });

    it('records the choice on the proof audit row', async () => {
        const { returnId } = await approvedReturn('defective');
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await returnService.recordProofOfSending(
            returnId,
            { ...proofOn(new Date()), refundOnProof: true },
            callerContextAs('admin')
        );

        const row = auditSpy.mock.calls
            .map(([event]) => event)
            .find(({ action }) => action === 'admin.return.proof_recorded');
        expect(row?.metadata).toMatchObject({ opensRefund: true, refundOnProof: true });
    });

    it.each(['withdrawal', 'other'] as const)(
        'refuses it on a %s with 422 on refundOnProof, and records nothing',
        async (reason) => {
            const { returnId } = await approvedReturn(reason === 'other' ? 'defective' : reason);
            // A goodwill return cannot be opened by the fixture, so its reason is set directly.
            if (reason === 'other') await returnModel.updateOne({ _id: returnId }, { reason });

            const result = await returnService.recordProofOfSending(
                returnId,
                { ...proofOn(new Date()), refundOnProof: true },
                callerContextAs('admin')
            );

            expect(asReject(result).status).toBe(422);
            expect(asReject(result).errors[0]).toMatchObject({
                code: 'RETURN_REFUND_ON_PROOF_INVALID',
                details: { field: 'refundOnProof' }
            });
            const reread = await returnRepository.findById(returnId);
            expect(reread?.proofOfSendingAt).toBeUndefined();
        }
    );

    it('turns the cancel action off and refuses a cancel with 409 RETURN_REFUND_OPEN', async () => {
        const { returnId } = await approvedReturn('defective');
        await returnService.recordProofOfSending(
            returnId,
            { ...proofOn(new Date()), refundOnProof: true },
            callerContextAs('admin')
        );
        const stored = await returnRepository.findById(returnId);

        const result = await returnService.cancelReturn(
            returnId,
            undefined,
            callerContextAs('admin')
        );

        expect(returnService.withActions(stored!, asAdmin()).actions.cancel).toBe(false);
        expect(asReject(result).errors[0].code).toBe('RETURN_REFUND_OPEN');
        const reread = await returnRepository.findById(returnId);
        expect(reread?.status).toBe('approved');
    });

    it('refuses a repair or a replacement at receipt with 409, before anything moves', async () => {
        const { shirt, returnId } = await approvedReturn('defective');
        await returnService.recordProofOfSending(
            returnId,
            { ...proofOn(new Date()), refundOnProof: true },
            callerContextAs('admin')
        );

        for (const remedy of ['repair', 'replace'] as const) {
            const result = await returnService.receiveReturn(
                returnId,
                { remedy },
                callerContextAs('admin')
            );

            expect(asReject(result).status).toBe(409);
            expect(asReject(result).errors[0].code).toBe('RETURN_REFUND_OPENED_ON_PROOF');
        }
        const reread = await returnRepository.findById(returnId);
        expect(reread?.status).toBe('approved');
        expect(await countersOf(shirt._id)).toMatchObject({ onHand: 8 });
    });

    it('redoes a refund receipt that read the return before the proof landed: it closes, restocks, one refund', async () => {
        const { shirt, orderId, returnId } = await approvedReturn('defective');

        const result = await receiveOnStaleRead(returnId, 'refund');

        expect(result.success && result.data.status).toBe('closed');
        expect(await countersOf(shirt._id)).toMatchObject({ onHand: 10 });
        expect(await storedRefundStamps(orderId)).toHaveLength(1);
    });

    it('refuses a repair receipt that read the return before the proof landed, once it re-reads: 409, one refund, still approved', async () => {
        const { orderId, returnId } = await approvedReturn('defective');

        const result = await receiveOnStaleRead(returnId, 'repair');

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('RETURN_REFUND_OPENED_ON_PROOF');
        expect(await storedRefundStamps(orderId)).toHaveLength(1);
        const stored = await returnRepository.findById(returnId);
        expect(stored?.status).toBe('approved');
    });

    it('answers 409 not receivable when the retry loses too: one refund, still approved, nothing restocked', async () => {
        const { shirt, orderId, returnId } = await approvedReturn('defective');

        const result = await receiveOnStaleRead(returnId, 'refund', 2);

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('RETURN_NOT_RECEIVABLE');
        expect(await storedRefundStamps(orderId)).toHaveLength(1);
        expect(await countersOf(shirt._id)).toMatchObject({ onHand: 8 });
        const stored = await returnRepository.findById(returnId);
        expect(stored?.status).toBe('approved');
    });

    it('redoes a receipt whose claim a proof with refundOnProof beat inside its transaction: it lands, restocks, one refund, proof kept', async () => {
        const { shirt, orderId, returnId } = await approvedReturn('defective');
        const realLock = returnRepository.lockOrder.bind(returnRepository);
        let proofSaved = false;
        /**
         * The receipt has read the return (no proof yet) and opened its transaction; the proof
         * lands and commits just before the receipt's first write, the lock row.
         */
        jest.spyOn(returnRepository, 'lockOrder').mockImplementation(async (id, session) => {
            if (!proofSaved) {
                proofSaved = true;
                await returnService.recordProofOfSending(
                    returnId,
                    { ...proofOn(new Date()), refundOnProof: true },
                    callerContextAs('admin')
                );
            }
            return realLock(id, session);
        });

        // The file's afterEach restores the spy, throw or not.
        const result = await returnService.receiveReturn(returnId, {}, callerContextAs('admin'));

        // The first claim lost to the proof; the receipt re-read the return and landed on the second try.
        expect(result.success && result.data.status).toBe('closed');
        expect(await countersOf(shirt._id)).toMatchObject({ onHand: 10 });
        expect(await storedRefundStamps(orderId)).toHaveLength(1);
        const stored = await returnRepository.findById(returnId);
        expect(stored).toMatchObject({ refundOnProof: true });
        expect(stored?.proofOfSendingAt).toBeInstanceOf(Date);
    });

    it('lets a plain receipt restock and close it, opening no second refund', async () => {
        const { orderId, returnId } = await approvedReturn('defective');
        await returnService.recordProofOfSending(
            returnId,
            { ...proofOn(new Date()), refundOnProof: true },
            callerContextAs('admin')
        );

        const result = await returnService.receiveReturn(returnId, {}, callerContextAs('admin'));

        expect(result.success && result.data.status).toBe('closed');
        expect(await storedRefundStamps(orderId)).toHaveLength(1);
    });
});

/**
 * Two shirts (30.00) with 5.00 of standard delivery, paid and delivered; one shirt comes back under
 * a proof that opens its refund, then the other under a plain receipt that takes the last unit.
 * @param reason - a defect's first proof carries `refundOnProof`, a withdrawal's needs none
 * @returns `refundAmount` the plain receipt of the later return fixed: with the delivery, 35.00
 */
const secondReturnRefund = async (reason: 'withdrawal' | 'defective') => {
    buyers += 1;
    const user = await createUser({ email: `partial-${buyers}@example.com` });
    const shirt = await createProduct({ title: 'Shirt', price: '30.00', onHand: 10 });
    const order = await createOrder(user, [toOrderItem(shirt, 2)], {
        shippingMethod: 'standard',
        shippingCost: '5.00'
    });
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

    const oneShirt = [{ productId: String(shirt._id), quantity: 1 }];
    const open = async () => {
        const outcome = await returnService.createReturn(
            { orderId, reason, lines: oneShirt },
            asCustomer(user.id),
            testCallerContext
        );
        if (!outcome.success) throw new Error('expected a return');
        const id = String(outcome.data._id);
        if (reason !== 'withdrawal')
            await returnService.approveReturn(id, callerContextAs('admin'));
        return id;
    };
    const first = await open();
    const second = await open();
    await returnService.recordProofOfSending(
        first,
        { ...proofOn(new Date()), ...(reason === 'defective' ? { refundOnProof: true } : {}) },
        callerContextAs('admin')
    );

    const received = await returnService.receiveReturn(second, {}, callerContextAs('admin'));
    return received.success ? received.data.refundAmount : undefined;
};

describe('the delivery owed on a partial return whose refund opened on proof', () => {
    /**
     * Two shirts (30.00) with 5.00 of standard delivery, paid and delivered; one shirt comes back
     * under a proof that opens its refund, then the other under a plain receipt that takes the
     * last unit. Answers the refund of the SECOND return.
     */
    it('is refunded with the second return of a withdrawal: the first one already counts as settled', async () => {
        expect(await secondReturnRefund('withdrawal')).toBe('35.00');
    });

    it('is refunded with the second return of a defect whose first refund opened on proof', async () => {
        expect(await secondReturnRefund('defective')).toBe('35.00');
    });
});
