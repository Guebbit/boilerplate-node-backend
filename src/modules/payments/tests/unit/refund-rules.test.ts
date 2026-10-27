/**
 * @module
 * The pure refund rules added by staff's instruments: which refunds are still open, which may be
 * voided, and the legal deadline of a refund that pays for a withdrawal or a return.
 */
import { DisputeKind, DisputeStatus, RefundFailureReason, RefundStatus } from '@types';
import {
    exceedsRemaining,
    hasOpenChargeback,
    hasOpenDispute,
    isOpenRefund,
    lostToChargebacks,
    mayBeCanceled,
    mayBeSettledByHand,
    refundDueBy
} from '@modules/payments/domain';

/** A 100.00 payment with no refunds, on the given provider. */
const paymentOn = (provider: string) => ({
    provider,
    amount: 100,
    currency: 'EUR',
    refunds: []
});

/** A refund record of 30.00 in the given state. */
const refundIn = (facts: {
    status: RefundStatus;
    failureReason?: RefundFailureReason;
    reversedAt?: Date;
    providerRefundRef?: string;
}) => ({ amount: 30, currency: 'EUR', ...facts });

describe('isOpenRefund', () => {
    it.each([
        [RefundStatus.pending, undefined, true],
        [RefundStatus.failed, RefundFailureReason.unknown, true],
        [RefundStatus.failed, RefundFailureReason.declined, true],
        [RefundStatus.succeeded, undefined, false],
        [RefundStatus.failed, RefundFailureReason.canceled, false]
    ])('reads %s with %s as open: %s', (status, failureReason, expected) => {
        expect(isOpenRefund({ status, failureReason })).toBe(expected);
    });
});

describe('mayBeCanceled', () => {
    it('allows a hand-paid pending refund and refuses a settled or a canceled one', () => {
        const cash = paymentOn('manual');
        expect(mayBeCanceled(cash, refundIn({ status: RefundStatus.pending }))).toBe(true);
        expect(mayBeCanceled(cash, refundIn({ status: RefundStatus.succeeded }))).toBe(false);
        expect(
            mayBeCanceled(
                cash,
                refundIn({
                    status: RefundStatus.failed,
                    failureReason: RefundFailureReason.canceled
                })
            )
        ).toBe(false);
    });

    it('allows a card refund only after a refusal that proves the money did not move', () => {
        const card = paymentOn('stripe');
        const failed = (failureReason: RefundFailureReason) =>
            refundIn({ status: RefundStatus.failed, failureReason });
        expect(mayBeCanceled(card, failed(RefundFailureReason.declined))).toBe(true);
        expect(mayBeCanceled(card, failed(RefundFailureReason.insufficient_funds))).toBe(true);
        expect(mayBeCanceled(card, failed(RefundFailureReason.unknown))).toBe(false);
        expect(mayBeCanceled(card, failed(RefundFailureReason.provider_unavailable))).toBe(false);
        expect(mayBeCanceled(card, refundIn({ status: RefundStatus.pending }))).toBe(false);
        expect(mayBeCanceled(card, failed(RefundFailureReason.canceled))).toBe(false);
    });
});

describe('a refund the provider took back', () => {
    const card = paymentOn('stripe');
    const bounced = refundIn({
        status: RefundStatus.failed,
        failureReason: RefundFailureReason.unknown,
        reversedAt: new Date('2026-03-09T10:00:00.000Z')
    });

    it('is owed another way: an operator may report it paid, even for an unclear reason', () => {
        expect(mayBeSettledByHand(card, bounced)).toBe(true);
    });

    it('is not voided: it settled once and has its credit note', () => {
        expect(mayBeCanceled(card, bounced)).toBe(false);
    });

    it('is never settled by hand when the bank took it back in a dispute', () => {
        expect(
            mayBeSettledByHand(card, {
                ...bounced,
                failureReason: RefundFailureReason.disputed
            })
        ).toBe(false);
    });
});

describe('exceedsRemaining', () => {
    const settled = { ...refundIn({ status: RefundStatus.succeeded }), amount: 80 };

    it('holds an unsent refund that no longer fits what the provider already gave back', () => {
        const payment = { ...paymentOn('stripe'), refunds: [settled] };
        expect(exceedsRemaining(payment, refundIn({ status: RefundStatus.pending }))).toBe(true);
    });

    it('lets one fit that still does, and ignores a refund the provider took back', () => {
        const bouncedFirst = {
            ...settled,
            status: RefundStatus.failed,
            reversedAt: new Date()
        };
        const payment = { ...paymentOn('stripe'), refunds: [bouncedFirst] };
        expect(exceedsRemaining(payment, refundIn({ status: RefundStatus.pending }))).toBe(false);
    });

    it('never holds a refund the provider already holds', () => {
        const payment = { ...paymentOn('stripe'), refunds: [settled] };
        expect(
            exceedsRemaining(
                payment,
                refundIn({ status: RefundStatus.pending, providerRefundRef: 're_1' })
            )
        ).toBe(false);
    });
});

describe('refundDueBy', () => {
    const createdAt = new Date('2026-03-01T10:00:00.000Z');

    it('is 14 days after creation for a refund that pays a return or a remainder cancel', () => {
        expect(refundDueBy({ createdAt, returnId: 'r1' })?.toISOString()).toBe(
            '2026-03-15T10:00:00.000Z'
        );
    });

    it('is absent for a refund that pays no return', () => {
        expect(refundDueBy({ createdAt })).toBeUndefined();
    });
});

/** A chargeback of `amount` (100.00 unless said) in the given state. */
const chargeback = (status: DisputeStatus, amount = 100) => ({
    kind: DisputeKind.chargeback,
    status,
    amount,
    currency: 'EUR'
});

/** An inquiry of 100.00 in the given state. */
const inquiry = (status: DisputeStatus) => ({
    kind: DisputeKind.inquiry,
    status,
    amount: 100,
    currency: 'EUR'
});

describe('the dispute rules', () => {
    it('closes the refund door for an open chargeback only, not for an inquiry', () => {
        expect(hasOpenChargeback({ disputes: [chargeback(DisputeStatus.needs_response)] })).toBe(
            true
        );
        expect(hasOpenChargeback({ disputes: [chargeback(DisputeStatus.under_review)] })).toBe(
            true
        );
        expect(hasOpenChargeback({ disputes: [inquiry(DisputeStatus.needs_response)] })).toBe(
            false
        );
        expect(hasOpenChargeback({ disputes: [chargeback(DisputeStatus.won)] })).toBe(false);
        expect(hasOpenChargeback({})).toBe(false);
    });

    it('counts any open dispute, inquiry included, for the list filter', () => {
        expect(hasOpenDispute({ disputes: [inquiry(DisputeStatus.needs_response)] })).toBe(true);
        expect(hasOpenDispute({ disputes: [inquiry(DisputeStatus.closed)] })).toBe(false);
    });

    it('takes only lost or accepted chargebacks off what can be refunded', () => {
        const taken = (disputes: ReturnType<typeof chargeback>[]) =>
            lostToChargebacks({ disputes }, 'EUR');
        expect(taken([chargeback(DisputeStatus.lost, 40)])).toBe(4000);
        expect(
            taken([chargeback(DisputeStatus.accepted, 40), chargeback(DisputeStatus.lost, 10)])
        ).toBe(5000);
        expect(
            taken([chargeback(DisputeStatus.won, 40), chargeback(DisputeStatus.needs_response)])
        ).toBe(0);
        expect(lostToChargebacks({ disputes: [{ ...inquiry(DisputeStatus.lost) }] }, 'EUR')).toBe(
            0
        );
    });

    describe('a refund refused as disputed', () => {
        const card = paymentOn('stripe');
        const refused = refundIn({
            status: RefundStatus.failed,
            failureReason: RefundFailureReason.disputed
        });

        it('is not settled by hand while the chargeback is open', () => {
            const open = { ...card, disputes: [chargeback(DisputeStatus.needs_response)] };
            expect(mayBeSettledByHand(open, refused)).toBe(false);
            expect(mayBeCanceled(open, refused)).toBe(false);
        });

        it('is settled by hand once a lost chargeback covers it (the bank paid the buyer)', () => {
            const lost = { ...card, disputes: [chargeback(DisputeStatus.lost, 30)] };
            expect(mayBeSettledByHand(lost, refused)).toBe(true);
        });

        it('is not settled by hand when the lost chargeback is smaller than the refund', () => {
            const lost = { ...card, disputes: [chargeback(DisputeStatus.lost, 29.99)] };
            expect(mayBeSettledByHand(lost, refused)).toBe(false);
        });

        it('may be voided, not settled, once the shop won', () => {
            const won = { ...card, disputes: [chargeback(DisputeStatus.won)] };
            expect(mayBeSettledByHand(won, refused)).toBe(false);
            expect(mayBeCanceled(won, refused)).toBe(true);
        });
    });
});
