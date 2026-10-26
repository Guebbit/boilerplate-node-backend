/**
 * @module
 * The pure refund rules added by staff's instruments: which refunds are still open, which may be
 * voided, and the legal deadline of a refund that pays for a withdrawal or a return.
 */
import { RefundFailureReason, RefundStatus } from '@types';
import { isOpenRefund, mayBeCanceled } from '@modules/payments/domain';

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
        const cash = { provider: 'manual' };
        expect(mayBeCanceled(cash, { status: RefundStatus.pending })).toBe(true);
        expect(mayBeCanceled(cash, { status: RefundStatus.succeeded })).toBe(false);
        expect(
            mayBeCanceled(cash, {
                status: RefundStatus.failed,
                failureReason: RefundFailureReason.canceled
            })
        ).toBe(false);
    });

    it('allows a card refund only after a refusal that proves the money did not move', () => {
        const card = { provider: 'stripe' };
        const failed = (failureReason: RefundFailureReason) => ({
            status: RefundStatus.failed,
            failureReason
        });
        expect(mayBeCanceled(card, failed(RefundFailureReason.declined))).toBe(true);
        expect(mayBeCanceled(card, failed(RefundFailureReason.insufficient_funds))).toBe(true);
        expect(mayBeCanceled(card, failed(RefundFailureReason.unknown))).toBe(false);
        expect(mayBeCanceled(card, failed(RefundFailureReason.provider_unavailable))).toBe(false);
        expect(mayBeCanceled(card, { status: RefundStatus.pending })).toBe(false);
        expect(mayBeCanceled(card, failed(RefundFailureReason.canceled))).toBe(false);
    });
});
