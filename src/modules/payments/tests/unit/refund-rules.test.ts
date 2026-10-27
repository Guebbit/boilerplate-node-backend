/**
 * @module
 * The pure refund rules added by staff's instruments: which refunds are still open, which may be
 * voided, and the legal deadline of a refund that pays for a withdrawal or a return.
 */
import { RefundFailureReason, RefundStatus } from '@types';
import {
    exceedsRemaining,
    isOpenRefund,
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
